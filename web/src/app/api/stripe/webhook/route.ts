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

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const userId = session.metadata?.userId;
    const credits = Number(session.metadata?.credits);
    if (!userId || !Number.isInteger(credits) || credits <= 0) {
      // Not one of our sessions (or corrupted metadata) — acknowledge and move on.
      return NextResponse.json({ received: true });
    }
    // Idempotent by event id: Stripe retries deliveries, credits apply once.
    await grantCredits(userId, credits, "purchase", { stripeEventId: event.id });
  }

  return NextResponse.json({ received: true });
}
