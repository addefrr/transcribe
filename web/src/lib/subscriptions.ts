import { and, eq } from "drizzle-orm";
import { isAdmin } from "./admin";
import { db } from "./db";
import type { TierKey } from "./pricing";
import { creditLedger, subscriptions, type Subscription } from "./schema";
import { planAllowanceMinutes, type Settings, type SubscriptionPlan } from "./settings";

/** A premium subscription covers premium AND standard; standard covers standard. */
export function subscriptionCovers(sub: Subscription, tier: TierKey): boolean {
  if (sub.tier === "premium") return true;
  return tier === "standard";
}

export function remainingMinutes(sub: Subscription): number {
  return Math.max(0, sub.allowanceMinutes - sub.minutesUsed);
}

/** Whether this request should deliberately ignore the admin's own plan. */
export function isSubscriptionBypassed(
  user: { email: string; emailVerified: boolean } | null | undefined,
  settings: Settings,
): boolean {
  return settings.developerSubscriptionBypass && isAdmin(user);
}

export function addInterval(from: Date, interval: string): Date {
  if (interval === "week") {
    return new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);
  }

  // Date#setMonth rolls overflow days into the following month (Jan 31 can
  // become Mar 3). Build the target in UTC and clamp to its final day instead,
  // matching PostgreSQL interval arithmetic and the Python worker.
  const months = interval === "year" ? 12 : 1;
  const year = from.getUTCFullYear();
  const month = from.getUTCMonth() + months;
  const targetYear = year + Math.floor(month / 12);
  const targetMonth = ((month % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(
    targetYear,
    targetMonth,
    Math.min(from.getUTCDate(), lastDay),
    from.getUTCHours(),
    from.getUTCMinutes(),
    from.getUTCSeconds(),
    from.getUTCMilliseconds(),
  ));
}

function allowanceInterval(interval: string): "month" | "week" {
  return interval === "week" ? "week" : "month";
}

function advanceAllowanceWindow(sub: Subscription, now: Date): {
  allowancePeriodStart: Date;
  allowancePeriodEnd: Date;
} | null {
  if (now < sub.allowancePeriodEnd) return null;
  let allowancePeriodStart = sub.allowancePeriodStart;
  let allowancePeriodEnd = sub.allowancePeriodEnd;
  const cadence = allowanceInterval(sub.interval);
  while (now >= allowancePeriodEnd) {
    allowancePeriodStart = allowancePeriodEnd;
    allowancePeriodEnd = addInterval(allowancePeriodEnd, cadence);
  }
  return { allowancePeriodStart, allowancePeriodEnd };
}

/**
 * Start a subscription, replacing any existing active one. Used by the dev
 * fake-subscribe path and the Stripe webhook.
 */
export async function activateSubscription(
  userId: string,
  plan: SubscriptionPlan,
  settings: Settings,
  stripeSubscriptionId?: string,
  stripeCustomerId?: string,
  stripeEventId?: string,
  amountPaidUsdCents: number = plan.priceUsdCents,
  allowanceMinutesOverride?: number,
): Promise<Subscription> {
  const now = new Date();
  return db.transaction(async (tx) => {
    // The ledger's unique Stripe event ID makes activation + revenue recording
    // one atomic, replay-safe operation.
    if (stripeEventId) {
      const inserted = await tx
        .insert(creditLedger)
        .values({
          userId,
          delta: 0,
          reason: "subscription",
          stripeEventId,
          amountUsdCents: amountPaidUsdCents,
        })
        .onConflictDoNothing({ target: creditLedger.stripeEventId })
        .returning({ id: creditLedger.id });
      if (inserted.length === 0) {
        const [existing] = await tx
          .select()
          .from(subscriptions)
          .where(
            stripeSubscriptionId
              ? eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId)
              : and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active")),
          )
          .limit(1);
        if (existing) return existing;
        throw new Error("Subscription event was already processed.");
      }
    } else {
      await tx.insert(creditLedger).values({
        userId,
        delta: 0,
        reason: "subscription",
        amountUsdCents: amountPaidUsdCents,
      });
    }
    await tx
      .update(subscriptions)
      .set({ status: "canceled" })
      .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active")));
    const [created] = await tx
      .insert(subscriptions)
      .values({
        userId,
        planId: plan.id,
        tier: plan.tier,
        interval: plan.interval,
        status: "active",
        allowanceMinutes:
          Number.isInteger(allowanceMinutesOverride) && allowanceMinutesOverride! > 0
            ? allowanceMinutesOverride!
            : planAllowanceMinutes(plan, settings),
        minutesUsed: 0,
        allowancePeriodStart: now,
        allowancePeriodEnd: addInterval(now, allowanceInterval(plan.interval)),
        periodStart: now,
        periodEnd: addInterval(now, plan.interval),
        stripeSubscriptionId: stripeSubscriptionId ?? null,
        stripeCustomerId: stripeCustomerId ?? null,
        cancelAtPeriodEnd: false,
      })
      .returning();
    return created;
  });
}

/** Keep the local entitlement window in sync with Stripe's recurring period. */
export async function syncStripeSubscription(
  stripeSubscriptionId: string,
  stripeStatus: string,
  periodStart: Date,
  periodEnd: Date,
  cancelAtPeriodEnd: boolean,
  stripeCustomerId?: string,
): Promise<void> {
  // A failed or overdue payment must not retain transcription entitlement.
  // Keep Stripe's non-entitled status locally so the account can explain the
  // billing problem and prevent a second subscription while recovery is still
  // possible. Trialing is entitled; this app does not currently create trials,
  // but Stripe may report one for a manually configured subscription.
  const active = stripeStatus === "active" || stripeStatus === "trialing";
  const localStatus = active ? "active" : stripeStatus;
  await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId))
      .for("update")
      .limit(1);
    if (!current) return;
    const allowanceWindow = active ? advanceAllowanceWindow(current, new Date()) : null;
    await tx
      .update(subscriptions)
      .set({
        status: localStatus,
        periodStart,
        periodEnd,
        cancelAtPeriodEnd,
        ...(allowanceWindow ? { ...allowanceWindow, minutesUsed: 0 } : {}),
        ...(stripeCustomerId ? { stripeCustomerId } : {}),
      })
      .where(eq(subscriptions.id, current.id));
  });
}

/**
 * The user's currently-active subscription, or null. Lazily rolls the period
 * for renewing (month/year) fake subscriptions and expires one-time week passes
 * whose window has ended. Stripe-backed subscriptions are driven by webhooks, so
 * they're only rolled here defensively (never advanced past their Stripe period).
 */
export async function getActiveSubscription(userId: string): Promise<Subscription | null> {
  return db.transaction(async (tx) => {
    // The worker reserves allowance by locking this same row. Rolling a window
    // without a lock could otherwise overwrite minutes reserved concurrently.
    let [sub] = await tx
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active")))
      .for("update")
      .limit(1);
    if (!sub) return null;

    const now = new Date();
    if (now > sub.periodEnd) {
      if (sub.interval === "week" || sub.stripeSubscriptionId || sub.cancelAtPeriodEnd) {
        // One-time pass, or a Stripe plan whose renewal webhook has not arrived:
        // deny usage rather than accidentally extending a paid plan for free.
        await tx
          .update(subscriptions)
          .set({ status: "expired" })
          .where(eq(subscriptions.id, sub.id));
        return null;
      }

      // Renewing fake subscription: advance the billing period and begin a new
      // allowance window. This path exists only for local development.
      let periodStart = sub.periodStart;
      let periodEnd = sub.periodEnd;
      while (now > periodEnd) {
        periodStart = periodEnd;
        periodEnd = addInterval(periodEnd, sub.interval);
      }
      const [rolled] = await tx
        .update(subscriptions)
        .set({
          periodStart,
          periodEnd,
          minutesUsed: 0,
          allowancePeriodStart: now,
          allowancePeriodEnd: addInterval(now, allowanceInterval(sub.interval)),
        })
        .where(eq(subscriptions.id, sub.id))
        .returning();
      return rolled;
    }

    // Annual plans keep a year-long billing period but reset their allowance
    // monthly. Monthly plans normally reach this through their Stripe period
    // update; this defensive path also handles a delayed page visit.
    const allowanceWindow = advanceAllowanceWindow(sub, now);
    if (allowanceWindow) {
      [sub] = await tx
        .update(subscriptions)
        .set({ ...allowanceWindow, minutesUsed: 0 })
        .where(eq(subscriptions.id, sub.id))
        .returning();
    }
    return sub;
  });
}

export async function setSubscriptionCancellation(
  subscriptionId: string,
  userId: string,
  cancelAtPeriodEnd: boolean,
): Promise<Subscription | null> {
  const [updated] = await db
    .update(subscriptions)
    .set({ cancelAtPeriodEnd })
    .where(
      and(
        eq(subscriptions.id, subscriptionId),
        eq(subscriptions.userId, userId),
        eq(subscriptions.status, "active"),
      ),
    )
    .returning();
  return updated ?? null;
}
