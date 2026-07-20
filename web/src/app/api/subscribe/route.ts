import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { APP_URL, getStripe } from "@/lib/stripe";
import { activateSubscription } from "@/lib/subscriptions";

// Form POST from /plans. Starts a subscription. In dev fake mode it activates
// instantly; with Stripe it opens Checkout (subscription mode for month/year,
// one-time payment for a week pass) and the webhook activates on success.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", APP_URL), 303);

  const settings = await getSettings();
  if (!settings.subscriptionsEnabled) {
    return NextResponse.json({ error: "Subscriptions are disabled." }, { status: 403 });
  }
  const form = await req.formData();
  const plan = settings.subscriptionPlans.find((p) => p.id === form.get("planId"));
  if (!plan) {
    return NextResponse.json({ error: "Unknown plan" }, { status: 400 });
  }

  const stripe = getStripe();
  if (!stripe) {
    if (process.env.DEV_FAKE_CHECKOUT === "1") {
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
  const session = await stripe.checkout.sessions.create({
    mode: recurring ? "subscription" : "payment",
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: plan.priceUsdCents,
          product_data: { name: plan.label },
          ...(recurring
            ? { recurring: { interval: plan.interval as "month" | "year" } }
            : {}),
        },
        quantity: 1,
      },
    ],
    metadata: { userId: user.id, planId: plan.id },
    success_url: `${APP_URL}/plans?subscribed=1`,
    cancel_url: `${APP_URL}/plans?canceled=1`,
  });

  return NextResponse.redirect(session.url!, 303);
}
