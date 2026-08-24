import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { grantCredits } from "@/lib/credits";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { subscriptions } from "@/lib/schema";
import { getStripe } from "@/lib/stripe";
import { activateSubscription, syncStripeSubscription } from "@/lib/subscriptions";
import type { SubscriptionPlan } from "@/lib/settings";

function positiveInteger(value: string | null | undefined): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function planFromCheckout(
  session: Stripe.Checkout.Session,
  currentPlans: SubscriptionPlan[],
): { plan: SubscriptionPlan; allowanceMinutes?: number } | null {
  const planId = session.metadata?.planId;
  if (!planId) return null;
  const current = currentPlans.find((candidate) => candidate.id === planId);
  const tier = session.metadata?.planTier;
  const interval = session.metadata?.planInterval;
  const priceUsdCents = positiveInteger(session.metadata?.planPriceUsdCents);
  const allowanceMinutes = positiveInteger(session.metadata?.allowanceMinutes);
  if (
    (tier === "standard" || tier === "premium") &&
    (interval === "month" || interval === "year" || interval === "week") &&
    priceUsdCents &&
    allowanceMinutes
  ) {
    return {
      plan: {
        id: planId,
        tier,
        interval,
        label: session.metadata?.planLabel?.slice(0, 200) || current?.label || planId,
        priceUsdCents,
        allowanceMinutes,
      },
      allowanceMinutes,
    };
  }
  // Backward compatibility for Checkout sessions created before entitlement
  // snapshots were added. A removed plan must not be silently acknowledged.
  return current ? { plan: current } : null;
}

function checkoutRevenueCents(session: Stripe.Checkout.Session): number | undefined {
  if (session.amount_total !== null) {
    const tax = session.total_details?.amount_tax;
    if (typeof tax === "number") return Math.max(0, session.amount_total - tax);
  }
  // Without tax detail, keep the paid after-discount total rather than risking
  // an overstated pre-discount subtotal. This fallback can still include tax
  // and is therefore deliberately documented as ambiguous operational data.
  return session.amount_total ?? session.amount_subtotal ?? undefined;
}

function invoiceRevenueCents(invoice: Stripe.Invoice): number {
  if (invoice.total_excluding_tax !== null) {
    return Math.max(0, Math.min(invoice.amount_paid, invoice.total_excluding_tax));
  }
  const knownTax = invoice.total_taxes?.reduce((sum, item) => sum + item.amount, 0);
  return typeof knownTax === "number"
    ? Math.max(0, invoice.amount_paid - knownTax)
    : Math.max(0, invoice.amount_paid);
}

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) {
    return NextResponse.json({ error: "Stripe is not configured" }, { status: 503 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await req.text(), signature, secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Delayed payment methods fire `completed` with payment_status "unpaid" and
  // `async_payment_succeeded` once the money actually arrives — only ever
  // grant credits for a session that is paid.
  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    const session = event.data.object;
    const userId = session.metadata?.userId;
    if (session.payment_status !== "paid" || !userId) {
      return NextResponse.json({ received: true });
    }

    // Subscription / week-pass purchase.
    if (session.metadata?.planId) {
      const settings = await getSettings();
      const purchase = planFromCheckout(session, settings.subscriptionPlans);
      if (!purchase) {
        // Returning an error makes Stripe retry instead of permanently losing a
        // paid entitlement if an old plan was removed while Checkout was open.
        return NextResponse.json(
          { error: "Paid plan terms could not be recovered" },
          { status: 500 },
        );
      }
      await activateSubscription(
        userId,
        purchase.plan,
        settings,
        typeof session.subscription === "string" ? session.subscription : undefined,
        typeof session.customer === "string" ? session.customer : undefined,
        event.id,
        checkoutRevenueCents(session) ?? purchase.plan.priceUsdCents,
        purchase.allowanceMinutes,
      );
      return NextResponse.json({ received: true });
    }

    // Credit-pack / custom purchase.
    const credits = Number(session.metadata?.credits);
    if (!Number.isInteger(credits) || credits <= 0) {
      return NextResponse.json({ received: true });
    }
    // Idempotent by event id: Stripe retries deliveries, credits apply once.
    await grantCredits(userId, credits, "purchase", {
      stripeEventId: event.id,
      amountUsdCents: checkoutRevenueCents(session),
    });
  }

  // Initial recurring revenue is recorded by Checkout above. Later paid
  // renewal invoices need their own idempotent ledger entry so the spend wallet
  // and developer figures remain truthful.
  if (event.type === "invoice.paid") {
    const invoice = event.data.object;
    if (invoice.billing_reason === "subscription_cycle") {
      const parent = invoice.parent as unknown as {
        subscription_details?: { subscription?: string | { id?: string } | null };
      } | null;
      const reference = parent?.subscription_details?.subscription;
      const stripeSubscriptionId =
        typeof reference === "string" ? reference : reference?.id;
      if (stripeSubscriptionId) {
        const [local] = await db
          .select({ userId: subscriptions.userId })
          .from(subscriptions)
          .where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId))
          .limit(1);
        if (local) {
          await grantCredits(local.userId, 0, "subscription", {
            stripeEventId: event.id,
            amountUsdCents: invoiceRevenueCents(invoice),
          });
        }
      }
    }
  }

  // Checkout starts a subscription, but future renewals/cancellations happen
  // outside Checkout. Sync those periods so annual subscriptions stay paid for
  // one year while their usage allowance continues resetting monthly.
  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const subscription = event.data.object;
    const periods = subscription.items.data
      .map((item) => ({ start: item.current_period_start, end: item.current_period_end }))
      .filter((period) => Number.isFinite(period.start) && Number.isFinite(period.end));
    if (periods.length > 0) {
      await syncStripeSubscription(
        subscription.id,
        subscription.status,
        new Date(Math.min(...periods.map((period) => period.start)) * 1000),
        new Date(Math.max(...periods.map((period) => period.end)) * 1000),
        subscription.cancel_at_period_end,
        typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
      );
    }
  }

  return NextResponse.json({ received: true });
}
