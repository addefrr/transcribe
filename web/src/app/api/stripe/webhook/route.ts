import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { grantCredits } from "@/lib/credits";
import { getStripe } from "@/lib/stripe";

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
    const credits = Number(session.metadata?.credits);
    if (
      session.payment_status !== "paid" ||
      !userId ||
      !Number.isInteger(credits) ||
      credits <= 0
    ) {
      // Unpaid yet, not one of our sessions, or corrupted metadata — ack and move on.
      return NextResponse.json({ received: true });
    }
    // Idempotent by event id: Stripe retries deliveries, credits apply once.
    // (A paid `completed` and a later `async_payment_succeeded` never both
    // fire for one session, so the two event types can't double-credit.)
    await grantCredits(userId, credits, "purchase", {
      stripeEventId: event.id,
      amountUsdCents: session.amount_total ?? undefined,
    });
  }

  return NextResponse.json({ received: true });
}
