import { NextRequest, NextResponse } from "next/server";
import { isUuid } from "@/lib/uuid";
import { getCurrentUser } from "@/lib/auth";
import { grantCredits } from "@/lib/credits";
import { getSettings } from "@/lib/settings";
import { APP_URL, getStripe } from "@/lib/stripe";

const MAX_STRIPE_UNIT_AMOUNT = 99_999_999;
const MAX_DATABASE_CREDITS = 2_147_483_647;

// Form POST from /credits. Buys either a named pack (packId) or a custom dollar
// amount (customUsdCents). Redirects to Stripe Checkout, or grants directly when
// DEV_FAKE_CHECKOUT=1 and Stripe isn't configured.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", APP_URL), 303);
  if (!user.emailVerified) {
    return NextResponse.json(
      { error: "Verify your email address before purchasing credits." },
      { status: 403 },
    );
  }

  const form = await req.formData();
  const settings = await getSettings();
  const checkoutAttempt = String(form.get("checkoutAttempt") ?? "");
  if (!isUuid(checkoutAttempt)) {
    return NextResponse.json(
      { error: "This checkout form is stale. Refresh the page and try again." },
      { status: 400 },
    );
  }

  // Resolve the purchase into { credits, amountUsdCents, label }.
  let credits: number;
  let amountUsdCents: number;
  let label: string;

  const customRaw = form.get("customUsdCents");
  if (customRaw != null && customRaw !== "") {
    if (!Number.isFinite(settings.usdCentsPerCredit) || settings.usdCentsPerCredit <= 0) {
      return NextResponse.json(
        { error: "Custom credit pricing is not configured correctly." },
        { status: 503 },
      );
    }
    amountUsdCents = Math.round(Number(customRaw));
    if (
      !Number.isSafeInteger(amountUsdCents) ||
      amountUsdCents < settings.minPurchaseUsdCents
    ) {
      return NextResponse.json(
        { error: `Minimum purchase is $${(settings.minPurchaseUsdCents / 100).toFixed(2)}.` },
        { status: 400 },
      );
    }
    credits = Math.floor(amountUsdCents / settings.usdCentsPerCredit);
    if (credits <= 0) {
      return NextResponse.json({ error: "Amount too small for any credits." }, { status: 400 });
    }
    label = `${credits} transcription credits`;
  } else {
    const pack = settings.packs.find((p) => p.id === form.get("packId"));
    if (!pack) {
      return NextResponse.json({ error: "Unknown credit pack" }, { status: 400 });
    }
    credits = pack.credits;
    amountUsdCents = pack.amountUsdCents;
    label = `${pack.name} pack — ${pack.credits} transcription credits`;
  }

  if (
    !Number.isInteger(amountUsdCents) ||
    amountUsdCents < 50 ||
    amountUsdCents > MAX_STRIPE_UNIT_AMOUNT ||
    !Number.isInteger(credits) ||
    credits <= 0 ||
    credits > MAX_DATABASE_CREDITS - user.creditBalance
  ) {
    return NextResponse.json(
      { error: "This purchase is outside the supported payment or account-balance range." },
      { status: 400 },
    );
  }

  const stripe = getStripe();
  if (!stripe) {
    if (process.env.DEV_FAKE_CHECKOUT === "1" && process.env.NODE_ENV !== "production") {
      await grantCredits(user.id, credits, "purchase", { amountUsdCents });
      return NextResponse.redirect(new URL("/credits?success=1", APP_URL), 303);
    }
    return NextResponse.json(
      { error: "Payments are not configured (set STRIPE_SECRET_KEY)." },
      { status: 503 },
    );
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    client_reference_id: user.id,
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: amountUsdCents,
          product_data: { name: label },
        },
        quantity: 1,
      },
    ],
    metadata: { userId: user.id, credits: String(credits) },
    customer_email: user.email,
    ...(process.env.STRIPE_AUTOMATIC_TAX === "1"
      ? { automatic_tax: { enabled: true } }
      : {}),
    success_url: `${APP_URL}/credits?success=1`,
    cancel_url: `${APP_URL}/credits?canceled=1`,
  }, {
    // The browser-generated form attempt is stable across a double submit, but
    // changes after a fresh page load so canceling Checkout never traps the
    // customer in an older session.
    idempotencyKey: `credit-checkout:${user.id}:${checkoutAttempt}`,
  });

  return NextResponse.redirect(session.url!, 303);
}
