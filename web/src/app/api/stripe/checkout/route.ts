import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { grantCredits } from "@/lib/credits";
import { getSettings } from "@/lib/settings";
import { APP_URL, getStripe } from "@/lib/stripe";

// Form POST from /credits. Buys either a named pack (packId) or a custom dollar
// amount (customUsdCents). Redirects to Stripe Checkout, or grants directly when
// DEV_FAKE_CHECKOUT=1 and Stripe isn't configured.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", APP_URL), 303);

  const form = await req.formData();
  const settings = await getSettings();

  // Resolve the purchase into { credits, amountUsdCents, label }.
  let credits: number;
  let amountUsdCents: number;
  let label: string;

  const customRaw = form.get("customUsdCents");
  if (customRaw != null && customRaw !== "") {
    amountUsdCents = Math.round(Number(customRaw));
    if (!Number.isFinite(amountUsdCents) || amountUsdCents < settings.minPurchaseUsdCents) {
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

  const stripe = getStripe();
  if (!stripe) {
    if (process.env.DEV_FAKE_CHECKOUT === "1") {
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
    success_url: `${APP_URL}/credits?success=1`,
    cancel_url: `${APP_URL}/credits?canceled=1`,
  });

  return NextResponse.redirect(session.url!, 303);
}
