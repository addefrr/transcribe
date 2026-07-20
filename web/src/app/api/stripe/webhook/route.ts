import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { grantCredits } from "@/lib/credits";
import { getSettings } from "@/lib/settings";
import { getStripe } from "@/lib/stripe";
import { activateSubscription } from "@/lib/subscriptions";

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
    const planId = session.metadata?.planId;
    if (planId) {
      const settings = await getSettings();
      const plan = settings.subscriptionPlans.find((p) => p.id === planId);
      if (plan) {
        await activateSubscription(
          userId,
          plan,
          settings,
          typeof session.subscription === "string" ? session.subscription : undefined,
        );
      }
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
      amountUsdCents: session.amount_total ?? undefined,
    });
  }

  return NextResponse.json({ received: true });
}
