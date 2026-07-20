import { and, eq } from "drizzle-orm";
import { db } from "./db";
import type { TierKey } from "./pricing";
import { subscriptions, type Subscription } from "./schema";
import { planAllowanceMinutes, type Settings, type SubscriptionPlan } from "./settings";

/** A premium subscription covers premium AND standard; standard covers standard. */
export function subscriptionCovers(sub: Subscription, tier: TierKey): boolean {
  if (sub.tier === "premium") return true;
  return tier === "standard";
}

export function remainingMinutes(sub: Subscription): number {
  return Math.max(0, sub.allowanceMinutes - sub.minutesUsed);
}

export function addInterval(from: Date, interval: string): Date {
  const d = new Date(from);
  if (interval === "week") d.setDate(d.getDate() + 7);
  else if (interval === "year") d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d;
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
): Promise<Subscription> {
  const now = new Date();
  return db.transaction(async (tx) => {
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
        allowanceMinutes: planAllowanceMinutes(plan, settings),
        minutesUsed: 0,
        periodStart: now,
        periodEnd: addInterval(now, plan.interval),
        stripeSubscriptionId: stripeSubscriptionId ?? null,
      })
      .returning();
    return created;
  });
}

/**
 * The user's currently-active subscription, or null. Lazily rolls the period
 * for renewing (month/year) fake subscriptions and expires one-time week passes
 * whose window has ended. Stripe-backed subscriptions are driven by webhooks, so
 * they're only rolled here defensively (never advanced past their Stripe period).
 */
export async function getActiveSubscription(userId: string): Promise<Subscription | null> {
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active")))
    .limit(1);
  if (!sub) return null;

  const now = new Date();
  if (now <= sub.periodEnd) return sub;

  // Period has ended.
  if (sub.interval === "week" || sub.stripeSubscriptionId) {
    // One-time pass, or a Stripe sub past its period with no renewal yet: expire.
    const status = sub.interval === "week" ? "expired" : sub.status;
    if (sub.interval === "week") {
      await db.update(subscriptions).set({ status: "expired" }).where(eq(subscriptions.id, sub.id));
      return null;
    }
    return { ...sub, status };
  }

  // Renewing fake subscription: advance the window(s) and reset usage.
  let periodStart = sub.periodStart;
  let periodEnd = sub.periodEnd;
  while (now > periodEnd) {
    periodStart = periodEnd;
    periodEnd = addInterval(periodEnd, sub.interval);
  }
  const [rolled] = await db
    .update(subscriptions)
    .set({ periodStart, periodEnd, minutesUsed: 0 })
    .where(eq(subscriptions.id, sub.id))
    .returning();
  return rolled;
}
