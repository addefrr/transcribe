"use server";

import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { destroySession, getCurrentUser, verifyPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { creditLedger, jobs, subscriptions, uploads, users } from "@/lib/schema";
import { getStripe } from "@/lib/stripe";
import { deleteObject } from "@/lib/storage";
import { rollUpAccountHistory } from "@/lib/financial-history";
import {
  getActiveSubscription,
  setSubscriptionCancellation,
} from "@/lib/subscriptions";

export type AccountActionState = {
  error?: string;
  notice?: string;
  fieldErrors?: { password?: string; confirmation?: string };
};

export async function cancelSubscriptionAction(): Promise<AccountActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in again to manage your plan." };
  const sub = await getActiveSubscription(user.id);
  if (!sub) return { error: "No active plan was found." };
  if (sub.interval === "week") {
    return { notice: "Your week pass is a one-time purchase and will end automatically." };
  }
  if (sub.cancelAtPeriodEnd) {
    return { notice: "Renewal is already canceled." };
  }
  if (sub.stripeSubscriptionId) {
    const stripe = getStripe();
    if (!stripe) return { error: "Billing is temporarily unavailable. Nothing changed." };
    try {
      await stripe.subscriptions.update(sub.stripeSubscriptionId, { cancel_at_period_end: true });
    } catch {
      return { error: "Stripe could not cancel the renewal. Nothing changed; try again." };
    }
  }
  await setSubscriptionCancellation(sub.id, user.id, true);
  revalidatePath("/account");
  revalidatePath("/plans");
  return {
    notice: `Renewal canceled. Your plan remains available through ${sub.periodEnd.toISOString().slice(0, 10)}.`,
  };
}

export async function resumeSubscriptionAction(): Promise<AccountActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in again to manage your plan." };
  const sub = await getActiveSubscription(user.id);
  if (!sub) return { error: "No active plan was found." };
  if (!sub.cancelAtPeriodEnd) return { notice: "Automatic renewal is already on." };
  if (sub.stripeSubscriptionId) {
    const stripe = getStripe();
    if (!stripe) return { error: "Billing is temporarily unavailable. Nothing changed." };
    try {
      await stripe.subscriptions.update(sub.stripeSubscriptionId, { cancel_at_period_end: false });
    } catch {
      return { error: "Stripe could not restore renewal. Nothing changed; try again." };
    }
  }
  await setSubscriptionCancellation(sub.id, user.id, false);
  revalidatePath("/account");
  revalidatePath("/plans");
  return { notice: "Automatic renewal restored." };
}

const deleteSchema = z.object({
  password: z.string().min(1, "Enter your password.").max(256, "Password is too long."),
  confirmation: z.literal("DELETE", { message: "Type DELETE exactly to confirm." }),
});

/**
 * Cancel work that has not been claimed, returning every customer hold. This
 * prevents a large queued playlist from making account deletion effectively
 * unavailable for hours. Processing jobs remain a short-lived blocker because
 * their worker may already hold media or be contacting a provider.
 */
async function cancelQueuedJobs(userId: string): Promise<number> {
  return db.transaction(async (tx) => {
    const [account] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .for("update")
      .limit(1);
    if (!account) return 0;

    const queued = await tx
      .select({
        id: jobs.id,
        creditsHeld: jobs.creditsHeld,
        creditsCharged: jobs.creditsCharged,
        subscriptionId: jobs.subscriptionId,
        subscriptionMinutesHeld: jobs.subscriptionMinutesHeld,
        subscriptionMinutesCharged: jobs.subscriptionMinutesCharged,
        allowancePeriodEnd: jobs.subscriptionAllowancePeriodEnd,
        providerStartedAt: jobs.providerStartedAt,
      })
      .from(jobs)
      .where(and(eq(jobs.userId, userId), eq(jobs.status, "pending")))
      .for("update");
    if (queued.length === 0) return 0;

    let creditRefund = 0;
    const refundRows: Array<typeof creditLedger.$inferInsert> = [];
    for (const job of queued) {
      const credits = Math.max(0, job.creditsHeld - job.creditsCharged);
      if (credits > 0) {
        creditRefund += credits;
        refundRows.push({
          userId,
          delta: credits,
          reason: "refund",
          jobId: job.id,
        });
      }
      const planMinutes = Math.max(
        0,
        job.subscriptionMinutesHeld - job.subscriptionMinutesCharged,
      );
      if (planMinutes > 0 && job.subscriptionId && job.allowancePeriodEnd) {
        await tx
          .update(subscriptions)
          .set({ minutesUsed: sql`greatest(0, ${subscriptions.minutesUsed} - ${planMinutes})` })
          .where(
            and(
              eq(subscriptions.id, job.subscriptionId),
              eq(subscriptions.allowancePeriodEnd, job.allowancePeriodEnd),
            ),
          );
      }
    }
    if (creditRefund > 0) {
      await tx
        .update(users)
        .set({ creditBalance: sql`${users.creditBalance} + ${creditRefund}` })
        .where(eq(users.id, userId));
      await tx.insert(creditLedger).values(refundRows);
    }

    const neverReachedProvider = queued
      .filter((job) => job.providerStartedAt === null)
      .map((job) => job.id);
    if (neverReachedProvider.length > 0) {
      await tx
        .update(jobs)
        .set({ estCostCents: 0 })
        .where(inArray(jobs.id, neverReachedProvider));
    }
    await tx
      .update(jobs)
      .set({
        status: "failed",
        creditsHeld: 0,
        subscriptionMinutesHeld: 0,
        error: "Canceled because account deletion was requested.",
        updatedAt: new Date(),
      })
      .where(inArray(jobs.id, queued.map((job) => job.id)));
    return queued.length;
  });
}

export async function deleteAccountAction(
  _previous: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in again before deleting your account." };
  const parsed = deleteSchema.safeParse({
    password: formData.get("password"),
    confirmation: formData.get("confirmation"),
  });
  if (!parsed.success) {
    const fields = parsed.error.flatten().fieldErrors;
    return {
      fieldErrors: {
        password: fields.password?.[0],
        confirmation: fields.confirmation?.[0],
      },
    };
  }
  if (!(await verifyPassword(user.passwordHash, parsed.data.password))) {
    return { fieldErrors: { password: "That password is not correct." } };
  }

  const canceledQueuedJobs = await cancelQueuedJobs(user.id);
  const cancellationNote = canceledQueuedJobs > 0
    ? canceledQueuedJobs === 1
      ? " One queued transcription was canceled and its holds were returned."
      : ` ${canceledQueuedJobs} queued transcriptions were canceled and their holds were returned.`
    : "";
  const active = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(
      and(
        eq(jobs.userId, user.id),
        inArray(jobs.status, ["pending", "probing", "downloading", "transcribing"]),
      ),
    )
    .limit(1);
  if (active.length) {
    return {
      error: `Wait for the currently processing transcription to finish before deleting the account.${cancellationNote}`,
    };
  }

  // Stop every Stripe subscription ever associated with this account, not
  // merely the one currently marked active locally. This also catches an older
  // subscription left renewing after overlapping Checkout sessions or delayed
  // webhook delivery.
  const remoteSubscriptions = await db
    .select({ stripeSubscriptionId: subscriptions.stripeSubscriptionId })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.userId, user.id),
        isNotNull(subscriptions.stripeSubscriptionId),
      ),
    );
  const hadRemoteSubscriptions = remoteSubscriptions.length > 0;
  if (remoteSubscriptions.length > 0) {
    const stripe = getStripe();
    if (!stripe) {
      return { error: `Billing is unavailable, so the account was not deleted.${cancellationNote}` };
    }
    try {
      for (const id of new Set(
        remoteSubscriptions
          .map((row) => row.stripeSubscriptionId)
          .filter((value): value is string => Boolean(value)),
      )) {
        let remote;
        try {
          remote = await stripe.subscriptions.retrieve(id);
        } catch (error) {
          // A missing Stripe object is already non-renewing and therefore safe
          // to treat as stopped. Other API failures remain blocking.
          if ((error as { code?: string }).code === "resource_missing") continue;
          throw error;
        }
        if (remote.status !== "canceled" && remote.status !== "incomplete_expired") {
          await stripe.subscriptions.cancel(id);
        }
      }
    } catch {
      return {
        error: `Stripe could not confirm that every subscription was stopped, so the account was not deleted. Some renewal settings may already have changed; try again or contact support.${cancellationNote}`,
      };
    }
  }

  const [mediaRows, uploadRows] = await Promise.all([
    db
      .select({ audioKey: jobs.audioKey, uploadKey: jobs.uploadKey })
      .from(jobs)
      .where(eq(jobs.userId, user.id)),
    db.select({ key: uploads.key }).from(uploads).where(eq(uploads.userId, user.id)),
  ]);
  const keys = new Set<string>();
  for (const row of mediaRows) {
    if (row.audioKey) keys.add(row.audioKey);
    if (row.uploadKey) keys.add(row.uploadKey);
  }
  for (const row of uploadRows) keys.add(row.key);
  try {
    await Promise.all([...keys].map((key) => deleteObject(key)));
  } catch {
    return {
      error: hadRemoteSubscriptions
        ? `Your account still exists. Its Stripe subscriptions were stopped, and some stored media may already have been removed, but media cleanup did not finish. Try deletion again or contact support.${cancellationNote}`
        : `Your account still exists. Some stored media may already have been removed, but cleanup did not finish. Try deletion again or contact support.${cancellationNote}`,
    };
  }

  try {
    const deleted = await db.transaction(async (tx) => {
      const [lockedUser] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, user.id))
        .for("update")
        .limit(1);
      // Concurrent retries must not add the same anonymous totals twice.
      if (!lockedUser) return false;
      await rollUpAccountHistory(tx, user.id);
      await tx
        .update(subscriptions)
        .set({ status: "canceled" })
        .where(and(eq(subscriptions.userId, user.id), eq(subscriptions.status, "active")));
      await tx.delete(users).where(eq(users.id, user.id));
      return true;
    });
    void deleted;
  } catch {
    return {
      error: hadRemoteSubscriptions
        ? `Your account still exists because final deletion failed. Its Stripe subscriptions were stopped and stored media was removed. Try again or contact support.${cancellationNote}`
        : `Your account still exists because final deletion failed, although stored media was removed. Try again or contact support.${cancellationNote}`,
    };
  }
  await destroySession();
  redirect("/?accountDeleted=1");
}
