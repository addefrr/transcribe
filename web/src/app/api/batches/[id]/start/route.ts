import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isTier, type Tier } from "@/lib/pricing";
import {
  creditLedger,
  jobBatches,
  jobs,
  subscriptions,
  users,
  type BatchItem,
  type Subscription,
} from "@/lib/schema";
import { getSettings } from "@/lib/settings";
import {
  getActiveSubscription,
  isSubscriptionBypassed,
  subscriptionCovers,
} from "@/lib/subscriptions";
import { isUuid } from "@/lib/uuid";
import { routeSupportsSpeakerLabels } from "@/lib/transcription-capabilities";
import {
  assertProviderSpendReservation,
  ProviderSpendCapacityError,
} from "@/lib/spend-budget";

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const MAX_BATCH_ITEMS = positiveInteger(process.env.MAX_PLAYLIST_ITEMS, 100);
const MAX_ITEM_SECONDS = positiveInteger(process.env.MAX_DURATION_SECONDS, 4 * 60 * 60);
const MAX_BATCH_SECONDS = positiveInteger(
  process.env.MAX_BATCH_DURATION_SECONDS,
  24 * 60 * 60,
);

class StartProblem extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}

type PricedItem = BatchItem & { duration: number };

function priceableItems(rawItems: BatchItem[]): PricedItem[] {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new StartProblem("This playlist has no videos to start.", 400, "EMPTY_BATCH");
  }
  if (rawItems.length > MAX_BATCH_ITEMS) {
    throw new StartProblem(
      `This playlist has ${rawItems.length} videos; the limit is ${MAX_BATCH_ITEMS}. No jobs were started.`,
      413,
      "ITEM_LIMIT",
    );
  }

  const unpriced = rawItems.filter(
    (item) => !Number.isFinite(item?.duration) || Number(item.duration) <= 0,
  );
  if (unpriced.length > 0) {
    throw new StartProblem(
      `${unpriced.length} video${unpriced.length === 1 ? "" : "s"} did not report a reliable duration, so the total charge cannot be confirmed. No jobs were started.`,
      409,
      "UNPRICED_ITEMS",
    );
  }

  const items = rawItems as PricedItem[];
  const oversized = items.find((item) => item.duration > MAX_ITEM_SECONDS);
  if (oversized) {
    throw new StartProblem(
      `“${oversized.title || "A playlist item"}” is longer than the ${Math.round(MAX_ITEM_SECONDS / 3600)}-hour per-video limit. No jobs were started.`,
      413,
      "ITEM_DURATION_LIMIT",
    );
  }
  const totalSeconds = items.reduce((sum, item) => sum + item.duration, 0);
  if (totalSeconds > MAX_BATCH_SECONDS) {
    throw new StartProblem(
      `This playlist contains more than ${Math.round(MAX_BATCH_SECONDS / 3600)} hours of audio. Submit a smaller playlist or individual videos. No jobs were started.`,
      413,
      "BATCH_DURATION_LIMIT",
    );
  }
  return items;
}

function billableMinutes(item: PricedItem): number {
  return Math.max(1, Math.ceil(item.duration / 60));
}

// Confirm a priced playlist and reserve every minute/credit before exposing any
// child job to the worker. The batch, active subscription, and user balance are
// locked in one transaction, so concurrent clicks and jobs cannot double-spend
// allowance or create duplicate children.
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!user.emailVerified) {
    return NextResponse.json(
      { error: "Verify your email address before starting a playlist." },
      { status: 403 },
    );
  }

  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const settings = await getSettings();
  const bypassSubscription = isSubscriptionBypassed(user, settings);
  // Roll an expired allowance window before the transaction takes its lock.
  if (!bypassSubscription) await getActiveSubscription(user.id);
  try {
    const result = await db.transaction(async (tx) => {
      const [batch] = await tx
        .select()
        .from(jobBatches)
        .where(and(eq(jobBatches.id, id), eq(jobBatches.userId, user.id)))
        .for("update")
        .limit(1);
      if (!batch) throw new StartProblem("Playlist not found.", 404, "NOT_FOUND");

      // A retry after a committed request is a successful no-op. This matters
      // when the browser loses the first response after jobs were created.
      if (batch.status === "started") {
        const existing = await tx
          .select({
            id: jobs.id,
            planMinutes: jobs.subscriptionMinutesHeld,
            backupCredits: jobs.creditsHeld,
          })
          .from(jobs)
          .where(and(eq(jobs.batchId, batch.id), eq(jobs.userId, user.id)));
        if (existing.length === 0) {
          throw new StartProblem(
            "This playlist is marked as started but has no jobs. Contact support with the playlist ID.",
            409,
            "INCOMPLETE_START",
          );
        }
        return {
          started: existing.length,
          alreadyStarted: true,
          planMinutes: existing.reduce((sum, job) => sum + job.planMinutes, 0),
          backupCredits: existing.reduce((sum, job) => sum + job.backupCredits, 0),
        };
      }
      if (batch.status === "expanding") {
        throw new StartProblem(
          "This playlist is still being inspected. Wait for the item list and price before starting it.",
          409,
          "NOT_READY",
        );
      }
      if (batch.status === "failed") {
        throw new StartProblem(
          "This playlist could not be inspected, so no jobs can be started from it.",
          409,
          "EXPANSION_FAILED",
        );
      }
      if (batch.status !== "ready") {
        throw new StartProblem("This playlist cannot be started.", 409, "INVALID_STATE");
      }
      if (!isTier(batch.tier)) {
        throw new StartProblem(
          "The saved transcription tier is no longer available. Submit the playlist again.",
          409,
          "INVALID_TIER",
        );
      }
      const tier: Tier = batch.tier;
      if (
        batch.diarize &&
        (!settings.tierFeatures[tier].speakerLabels || !routeSupportsSpeakerLabels(tier))
      ) {
        throw new StartProblem(
          "Speaker labels are no longer available with this processing option. Submit the playlist again with a current option.",
          409,
          "FEATURE_CHANGED",
        );
      }
      if (!Number.isInteger(batch.creditsPerMinute) || batch.creditsPerMinute <= 0) {
        throw new StartProblem(
          "The saved credit rate is invalid. Submit the playlist again.",
          409,
          "INVALID_RATE",
        );
      }

      const items = priceableItems(batch.items as BatchItem[]);
      const totalMinutes = items.reduce((sum, item) => sum + billableMinutes(item), 0);
      const projectedProviderCost = totalMinutes * Math.max(0, batch.costPerMinuteCents);
      try {
        await assertProviderSpendReservation(
          tx,
          projectedProviderCost,
          0,
          settings.walletSpendPct,
        );
      } catch (error) {
        if (!(error instanceof ProviderSpendCapacityError)) throw error;
        throw new StartProblem(
          "The whole playlist is above current processing capacity. No jobs were started; try a smaller playlist or individual videos.",
          503,
          "CAPACITY",
        );
      }

      // Keep the account -> subscription lock order consistent with account
      // deletion, confirmations, and worker-side holds.
      const [account] = await tx
        .select({ creditBalance: users.creditBalance })
        .from(users)
        .where(eq(users.id, user.id))
        .for("update")
        .limit(1);
      if (!account) throw new StartProblem("Account not found.", 401, "ACCOUNT_NOT_FOUND");

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
      const planMinutes = Math.min(totalMinutes, availablePlanMinutes);
      const backupMinutes = totalMinutes - planMinutes;
      const backupCredits = backupMinutes * batch.creditsPerMinute;

      if (account.creditBalance < backupCredits) {
        const shortage = backupCredits - account.creditBalance;
        throw new StartProblem(
          planMinutes > 0
            ? `Your plan covers ${planMinutes} minutes, then this playlist needs ${backupCredits} backup credits. You have ${account.creditBalance} and need ${shortage} more. No jobs were started.`
            : `This playlist needs ${backupCredits} credits. You have ${account.creditBalance} and need ${shortage} more. No jobs were started.`,
          402,
          "INSUFFICIENT_CREDITS",
        );
      }

      let unallocatedPlanMinutes = planMinutes;
      const confirmedAt = new Date();
      const reservations = items.map((item) => {
        const minutes = billableMinutes(item);
        const reservedPlanMinutes = Math.min(minutes, unallocatedPlanMinutes);
        unallocatedPlanMinutes -= reservedPlanMinutes;
        return {
          id: randomUUID(),
          item,
          planMinutes: reservedPlanMinutes,
          creditHold: (minutes - reservedPlanMinutes) * batch.creditsPerMinute,
        };
      });

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
      }

      await tx.insert(jobs).values(
        reservations.map((reservation) => ({
          id: reservation.id,
          userId: user.id,
          sourceType: "url" as const,
          sourceUrl: reservation.item.url,
          outputName: reservation.item.title || null,
          tier,
          creditsPerMinute: batch.creditsPerMinute,
          costPerMinuteCents: batch.costPerMinuteCents,
          billing: planCovers ? "subscription" : "credits",
          subscriptionId: planCovers ? activeSubscription!.id : null,
          subscriptionMinutesHeld: reservation.planMinutes,
          subscriptionAllowancePeriodEnd:
            planCovers && reservation.planMinutes > 0
              ? activeSubscription!.allowancePeriodEnd
              : null,
          creditsHeld: reservation.creditHold,
          estCostCents:
            billableMinutes(reservation.item) * Math.max(0, batch.costPerMinuteCents),
          durationSeconds: reservation.item.duration,
          batchId: batch.id,
          diarize: batch.diarize,
          languageHint: batch.languageHint,
          confirmedAt,
        })),
      );
      const creditHolds = reservations.filter((reservation) => reservation.creditHold > 0);
      if (creditHolds.length > 0) {
        await tx.insert(creditLedger).values(
          creditHolds.map((reservation) => ({
            userId: user.id,
            delta: -reservation.creditHold,
            reason: "hold",
            jobId: reservation.id,
          })),
        );
      }
      await tx
        .update(jobBatches)
        .set({
          status: "started",
          videoCount: items.length,
          totalSeconds: items.reduce((sum, item) => sum + item.duration, 0),
          error: null,
          updatedAt: confirmedAt,
        })
        .where(eq(jobBatches.id, batch.id));

      return {
        started: reservations.length,
        alreadyStarted: false,
        planMinutes,
        backupCredits,
      };
    });

    return NextResponse.json(result, { status: result.alreadyStarted ? 200 : 201 });
  } catch (error) {
    if (error instanceof StartProblem) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    console.error("playlist start failed", error);
    return NextResponse.json(
      {
        error:
          "The playlist could not be started. No partial batch was created; refresh and try again.",
        code: "START_FAILED",
      },
      { status: 500 },
    );
  }
}
