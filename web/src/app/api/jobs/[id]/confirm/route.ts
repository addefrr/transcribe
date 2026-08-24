import { and, eq, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isTier, type Tier } from "@/lib/pricing";
import { creditLedger, jobs, subscriptions, users, type Subscription } from "@/lib/schema";
import { getSettings } from "@/lib/settings";
import {
  getActiveSubscription,
  isSubscriptionBypassed,
  subscriptionCovers,
} from "@/lib/subscriptions";
import { routeSupportsSpeakerLabels } from "@/lib/transcription-capabilities";
import { isUuid } from "@/lib/uuid";
import {
  assertProviderSpendReservation,
  ProviderSpendCapacityError,
} from "@/lib/spend-budget";

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const MAX_ACTIVE_JOBS = positiveInteger(process.env.MAX_ACTIVE_JOBS_PER_USER, 3);
const MAX_DURATION_SECONDS = positiveInteger(process.env.MAX_DURATION_SECONDS, 4 * 60 * 60);
const ACTIVE = ["pending", "probing", "downloading", "transcribing"];

class ConfirmProblem extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}

/**
 * Confirm a worker-probed URL and reserve its plan minutes plus backup credits
 * in the same transaction that starts it. Repeating a committed request is a
 * successful no-op, which makes a lost browser response safe to retry.
 */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!user.emailVerified) {
    return NextResponse.json({ error: "Verify your email before continuing." }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const settings = await getSettings();
  const bypassSubscription = isSubscriptionBypassed(user, settings);
  // Roll an expired/reset allowance under its own row lock before this
  // transaction selects the current entitlement.
  if (!bypassSubscription) await getActiveSubscription(user.id);
  try {
    const result = await db.transaction(async (tx) => {
      const [job] = await tx
        .select()
        .from(jobs)
        .where(and(eq(jobs.id, id), eq(jobs.userId, user.id)))
        .for("update")
        .limit(1);
      if (!job) throw new ConfirmProblem("Transcription not found.", 404, "NOT_FOUND");

      if (job.confirmedAt) {
        return {
          started: true,
          alreadyStarted: true,
          minutes: job.durationSeconds
            ? Math.max(1, Math.ceil(job.durationSeconds / 60))
            : 0,
          planMinutes: job.subscriptionMinutesHeld,
          backupCredits: job.creditsHeld,
        };
      }
      if (job.status !== "awaiting_confirmation") {
        throw new ConfirmProblem(
          "This transcription is not waiting for confirmation.",
          409,
          "INVALID_STATE",
        );
      }
      if (!Number.isFinite(job.durationSeconds) || Number(job.durationSeconds) <= 0) {
        throw new ConfirmProblem(
          "The media duration could not be confirmed. Remove this item and submit it again.",
          409,
          "INVALID_DURATION",
        );
      }
      if (Number(job.durationSeconds) > MAX_DURATION_SECONDS) {
        throw new ConfirmProblem(
          "This media is longer than the configured per-file limit.",
          413,
          "DURATION_LIMIT",
        );
      }
      if (!isTier(job.tier)) {
        throw new ConfirmProblem(
          "The saved processing option is no longer available. Submit the source again.",
          409,
          "INVALID_TIER",
        );
      }
      const tier: Tier = job.tier;
      if (
        job.diarize &&
        (!settings.tierFeatures[tier].speakerLabels || !routeSupportsSpeakerLabels(tier))
      ) {
        throw new ConfirmProblem(
          "Speaker labels are no longer available with this processing option. Submit the source again with a current option.",
          409,
          "FEATURE_CHANGED",
        );
      }
      if (!Number.isInteger(job.creditsPerMinute) || job.creditsPerMinute <= 0) {
        throw new ConfirmProblem(
          "The saved credit rate is invalid. Submit the source again.",
          409,
          "INVALID_RATE",
        );
      }

      const minutes = Math.max(1, Math.ceil(Number(job.durationSeconds) / 60));
      const projectedProviderCost = minutes * Math.max(0, job.costPerMinuteCents);
      try {
        await assertProviderSpendReservation(
          tx,
          projectedProviderCost,
          job.estCostCents,
          settings.walletSpendPct,
        );
      } catch (error) {
        if (!(error instanceof ProviderSpendCapacityError)) throw error;
        throw new ConfirmProblem(
          "This transcription is above current processing capacity. Nothing was reserved; try again later.",
          503,
          "CAPACITY",
        );
      }

      // Lock the account before subscription rows. Account deletion, batch
      // starts, worker holds, and confirmations all use this order.
      const [account] = await tx
        .select({ creditBalance: users.creditBalance })
        .from(users)
        .where(eq(users.id, user.id))
        .for("update")
        .limit(1);
      if (!account) throw new ConfirmProblem("Account not found.", 401, "ACCOUNT_NOT_FOUND");

      const active = await tx
        .select({ id: jobs.id })
        .from(jobs)
        .where(and(eq(jobs.userId, user.id), inArray(jobs.status, ACTIVE)))
        .limit(MAX_ACTIVE_JOBS);
      if (active.length >= MAX_ACTIVE_JOBS) {
        throw new ConfirmProblem(
          `You already have ${active.length} transcriptions in progress. Wait for one to finish; nothing was reserved.`,
          429,
          "ACTIVE_JOB_LIMIT",
        );
      }

      let activeSubscription: Subscription | null = null;
      if (!bypassSubscription) {
        [activeSubscription] = await tx
          .select()
          .from(subscriptions)
          .where(and(eq(subscriptions.userId, user.id), eq(subscriptions.status, "active")))
          .for("update")
          .limit(1);
      }
      const now = new Date();
      const planCovers = Boolean(
        activeSubscription &&
          activeSubscription.periodEnd >= now &&
          activeSubscription.allowancePeriodEnd > now &&
          subscriptionCovers(activeSubscription, tier),
      );
      const availablePlanMinutes = planCovers
        ? Math.max(
            0,
            activeSubscription!.allowanceMinutes - activeSubscription!.minutesUsed,
          )
        : 0;
      const planMinutes = Math.min(minutes, availablePlanMinutes);
      const backupCredits = (minutes - planMinutes) * job.creditsPerMinute;

      if (account.creditBalance < backupCredits) {
        const shortage = backupCredits - account.creditBalance;
        throw new ConfirmProblem(
          planMinutes > 0
            ? `Your plan covers ${planMinutes} of ${minutes} minutes. The rest needs ${backupCredits} backup credits; you have ${account.creditBalance} and need ${shortage} more. Nothing was reserved.`
            : `This transcription needs ${backupCredits} credits; you have ${account.creditBalance} and need ${shortage} more. Nothing was reserved.`,
          402,
          "INSUFFICIENT_CREDITS",
        );
      }

      if (planMinutes > 0 && activeSubscription) {
        await tx
          .update(subscriptions)
          .set({ minutesUsed: activeSubscription.minutesUsed + planMinutes })
          .where(eq(subscriptions.id, activeSubscription.id));
      }
      if (backupCredits > 0) {
        await tx
          .update(users)
          .set({ creditBalance: account.creditBalance - backupCredits })
          .where(eq(users.id, user.id));
        await tx.insert(creditLedger).values({
          userId: user.id,
          delta: -backupCredits,
          reason: "hold",
          jobId: job.id,
        });
      }

      const confirmedAt = new Date();
      await tx
        .update(jobs)
        .set({
          status: "pending",
          billing: planCovers ? "subscription" : "credits",
          subscriptionId: planCovers ? activeSubscription!.id : null,
          subscriptionMinutesHeld: planMinutes,
          subscriptionAllowancePeriodEnd:
            planMinutes > 0 ? activeSubscription!.allowancePeriodEnd : null,
          creditsHeld: backupCredits,
          estCostCents: projectedProviderCost,
          confirmedAt,
          claimedAt: null,
          updatedAt: confirmedAt,
        })
        .where(eq(jobs.id, job.id));

      return {
        started: true,
        alreadyStarted: false,
        minutes,
        planMinutes,
        backupCredits,
      };
    });

    return NextResponse.json(result, { status: result.alreadyStarted ? 200 : 201 });
  } catch (error) {
    if (error instanceof ConfirmProblem) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    console.error("transcription confirmation failed", error);
    return NextResponse.json(
      {
        error: "The transcription could not be started. Nothing was reserved; refresh and try again.",
        code: "CONFIRM_FAILED",
      },
      { status: 500 },
    );
  }
}
