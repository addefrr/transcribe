"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { TIER_KEYS } from "@/lib/pricing";
import {
  getSettings,
  setSetting,
  type Pack,
  type SubscriptionPlan,
  type TierConfig,
} from "@/lib/settings";

function num(form: FormData, name: string, fallback: number): number {
  const v = Number(form.get(name));
  return Number.isFinite(v) ? v : fallback;
}

export async function saveSettings(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!isAdmin(user)) redirect("/dashboard");

  const current = await getSettings();

  // Tiers: editable label / rate / description per tier key.
  const tiers = { ...current.tiers };
  for (const key of TIER_KEYS) {
    const tier: TierConfig = {
      label: String(formData.get(`tier_${key}_label`) ?? current.tiers[key].label).slice(0, 60),
      creditsPerMinute: Math.max(
        1,
        Math.round(num(formData, `tier_${key}_cpm`, current.tiers[key].creditsPerMinute)),
      ),
      description: String(
        formData.get(`tier_${key}_desc`) ?? current.tiers[key].description,
      ).slice(0, 300),
    };
    tiers[key] = tier;
  }
  await setSetting("tiers", tiers);

  // Packs: edit existing packs in place (name / credits / price).
  const packs: Pack[] = current.packs.map((p) => ({
    id: p.id,
    name: String(formData.get(`pack_${p.id}_name`) ?? p.name).slice(0, 40),
    credits: Math.max(1, Math.round(num(formData, `pack_${p.id}_credits`, p.credits))),
    amountUsdCents: Math.max(50, Math.round(num(formData, `pack_${p.id}_cents`, p.amountUsdCents))),
  }));
  await setSetting("packs", packs);

  await setSetting(
    "signupBonusCredits",
    Math.max(0, Math.round(num(formData, "signupBonusCredits", current.signupBonusCredits))),
  );
  await setSetting(
    "usdCentsPerCredit",
    Math.max(1, num(formData, "usdCentsPerCredit", current.usdCentsPerCredit)),
  );
  await setSetting(
    "minPurchaseUsdCents",
    Math.max(50, Math.round(num(formData, "minPurchaseUsdCents", current.minPurchaseUsdCents))),
  );

  // Subscriptions: toggle, per-tier compute cost, and per-plan price/cap/label.
  await setSetting("subscriptionsEnabled", formData.get("subscriptionsEnabled") === "on");
  await setSetting("costPerMinuteCents", {
    standard: Math.max(
      0.001,
      num(formData, "cost_standard", current.costPerMinuteCents.standard),
    ),
    premium: Math.max(0.001, num(formData, "cost_premium", current.costPerMinuteCents.premium)),
  });
  const plans: SubscriptionPlan[] = current.subscriptionPlans.map((plan) => ({
    ...plan,
    label: String(formData.get(`plan_${plan.id}_label`) ?? plan.label).slice(0, 60),
    priceUsdCents: Math.max(50, Math.round(num(formData, `plan_${plan.id}_cents`, plan.priceUsdCents))),
    capPct: Math.min(100, Math.max(1, num(formData, `plan_${plan.id}_cap`, plan.capPct))),
  }));
  await setSetting("subscriptionPlans", plans);

  redirect("/developer/settings?saved=1");
}
