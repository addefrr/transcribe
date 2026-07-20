import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { grantCredits } from "@/lib/credits";
import { getSettings } from "@/lib/settings";
import { APP_URL, getStripe } from "@/lib/stripe";

// Form POST from /credits. Redirects to Stripe Checkout (or straight back to
// /credits when DEV_FAKE_CHECKOUT=1 and no Stripe key is configured).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", APP_URL), 303);

  const form = await req.formData();
  const { packs } = await getSettings();
  const pack = packs.find((p) => p.id === form.get("packId"));
  if (!pack) {
    return NextResponse.json({ error: "Unknown credit pack" }, { status: 400 });
  }

  const stripe = getStripe();
  if (!stripe) {
    if (process.env.DEV_FAKE_CHECKOUT === "1") {
      await grantCredits(user.id, pack.credits, "purchase", {
        amountUsdCents: pack.amountUsdCents,
      });
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
          unit_amount: pack.amountUsdCents,
          product_data: {
            name: `${pack.name} pack — ${pack.credits} transcription credits`,
          },
        },
        quantity: 1,
      },
    ],
    metadata: { userId: user.id, credits: String(pack.credits), packId: pack.id },
    success_url: `${APP_URL}/credits?success=1`,
    cancel_url: `${APP_URL}/credits?canceled=1`,
  });

  return NextResponse.redirect(session.url!, 303);
}
