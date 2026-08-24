import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { subscriptions } from "@/lib/schema";
import { APP_URL, getStripe } from "@/lib/stripe";

export async function POST(_req: NextRequest) {
  void _req;
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", APP_URL), 303);
  // Keep payment recovery available even when past_due/unpaid access has been
  // paused. Requiring an active entitlement here would lock the customer out
  // of the very portal needed to fix their payment method or cancel.
  const [billing] = await db
    .select({ stripeCustomerId: subscriptions.stripeCustomerId })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.userId, user.id),
        isNotNull(subscriptions.stripeCustomerId),
      ),
    )
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);
  const stripe = getStripe();
  if (!stripe || !billing?.stripeCustomerId) {
    return NextResponse.json({ error: "Billing portal is not available for this plan." }, { status: 404 });
  }
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: billing.stripeCustomerId,
      return_url: `${APP_URL}/account`,
    });
    return NextResponse.redirect(session.url, 303);
  } catch {
    return NextResponse.json(
      { error: "Billing portal is temporarily unavailable. Return to Account and try again." },
      { status: 503 },
    );
  }
}
