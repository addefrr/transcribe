import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { subscriptions } from "@/lib/schema";
import { getSettings } from "@/lib/settings";
import { planAllowanceMinutes } from "@/lib/settings";
import { APP_URL, getStripe } from "@/lib/stripe";
import { activateSubscription } from "@/lib/subscriptions";
import { getActiveSubscription } from "@/lib/subscriptions";
import { isUuid } from "@/lib/uuid";

const MAX_STRIPE_UNIT_AMOUNT = 99_999_999;
const MAX_DATABASE_MINUTES = 2_147_483_647;

// Form POST from /plans. Starts a subscription. In dev fake mode it activates
// instantly; with Stripe it opens Checkout (subscription mode for month/year,
// one-time payment for a week pass) and the webhook activates on success.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", APP_URL), 303);
  if (!user.emailVerified) {
    return NextResponse.json(
      { error: "Verify your email address before purchasing a plan." },
      { status: 403 },
    );
  }

  const settings = await getSettings();
  if (!settings.subscriptionsEnabled) {
    return NextResponse.json({ error: "Subscriptions are disabled." }, { status: 403 });
  }
  const form = await req.formData();
  const checkoutAttempt = String(form.get("checkoutAttempt") ?? "");
  if (!isUuid(checkoutAttempt)) {
    return NextResponse.json(
      { error: "This checkout form is stale. Refresh the page and try again." },
      { status: 400 },
    );
  }
  const plan = settings.subscriptionPlans.find((p) => p.id === form.get("planId"));
  if (!plan) {
    return NextResponse.json({ error: "Unknown plan" }, { status: 400 });
  }
  const active = await getActiveSubscription(user.id);
  if (active) {
    return NextResponse.json(
      { error: "You already have an active plan. Manage it from your account before changing plans." },
      { status: 409 },
    );
  }
  const [unresolvedBilling] = await db
    .select({ status: subscriptions.status })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.userId, user.id),
        isNotNull(subscriptions.stripeSubscriptionId),
        inArray(subscriptions.status, [
          "past_due",
          "unpaid",
          "paused",
          "incomplete",
          "expired",
        ]),
      ),
    )
    .limit(1);
  if (unresolvedBilling) {
    return NextResponse.json(
      {
        error:
          "Your existing Stripe plan needs payment attention before you can start another plan. Open Account and use payment details to resolve or cancel it.",
      },
      { status: 409 },
    );
  }

  const stripe = getStripe();
  if (!stripe) {
    if (process.env.DEV_FAKE_CHECKOUT === "1" && process.env.NODE_ENV !== "production") {
      await activateSubscription(user.id, plan, settings);
      return NextResponse.redirect(new URL("/plans?subscribed=1", APP_URL), 303);
    }
    return NextResponse.json(
      { error: "Payments are not configured (set STRIPE_SECRET_KEY)." },
      { status: 503 },
    );
  }

  // Week pass is a one-time purchase; monthly/annual are recurring.
  const recurring = plan.interval === "month" || plan.interval === "year";
  const allowanceMinutes = planAllowanceMinutes(plan, settings);
  if (
    !Number.isInteger(plan.priceUsdCents) ||
    plan.priceUsdCents < 50 ||
    plan.priceUsdCents > MAX_STRIPE_UNIT_AMOUNT ||
    !Number.isInteger(allowanceMinutes) ||
    allowanceMinutes <= 0 ||
    allowanceMinutes > MAX_DATABASE_MINUTES
  ) {
    return NextResponse.json(
      { error: "This plan is not configured with a supported price and allowance." },
      { status: 503 },
    );
  }
  const [priorBilling] = await db
    .select({ customerId: subscriptions.stripeCustomerId })
    .from(subscriptions)
    .where(and(eq(subscriptions.userId, user.id), isNotNull(subscriptions.stripeCustomerId)))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);
  const metadata = {
    userId: user.id,
    planId: plan.id,
    planTier: plan.tier,
    planInterval: plan.interval,
    planLabel: plan.label,
    planPriceUsdCents: String(plan.priceUsdCents),
    allowanceMinutes: String(allowanceMinutes),
  };
  const allowanceDescription = plan.interval === "week"
    ? `${allowanceMinutes} audio minutes for one 7-day pass; does not renew`
    : plan.interval === "year"
      ? `${allowanceMinutes} audio minutes each month; billed yearly; unused minutes do not roll over`
      : `${allowanceMinutes} audio minutes each month; renews monthly; unused minutes do not roll over`;
  const session = await stripe.checkout.sessions.create({
    mode: recurring ? "subscription" : "payment",
    client_reference_id: user.id,
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: plan.priceUsdCents,
          product_data: { name: plan.label, description: allowanceDescription },
          ...(recurring
            ? { recurring: { interval: plan.interval as "month" | "year" } }
            : {}),
        },
        quantity: 1,
      },
    ],
    metadata,
    ...(priorBilling?.customerId
      ? { customer: priorBilling.customerId }
      : { customer_email: user.email }),
    ...(process.env.STRIPE_AUTOMATIC_TAX === "1"
      ? { automatic_tax: { enabled: true } }
      : {}),
    ...(recurring
      ? { subscription_data: { metadata } }
      : {}),
    success_url: `${APP_URL}/plans?subscribed=1`,
    cancel_url: `${APP_URL}/plans?canceled=1`,
  }, {
    // One rendered form has one attempt ID: double submits are idempotent, but
    // a fresh page after cancellation can create a fresh Checkout session.
    idempotencyKey: `subscription-checkout:${user.id}:${checkoutAttempt}`,
  });

  return NextResponse.redirect(session.url!, 303);
}
