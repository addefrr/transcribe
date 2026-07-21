"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { type Content, CONTENT_NAMESPACES, DEFAULT_CONTENT } from "@/lib/content";
import { TIER_KEYS } from "@/lib/pricing";
import {
  getContent,
  getSettings,
  setContent,
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

  await setSetting(
    "walletSpendPct",
    Math.min(100, Math.max(1, num(formData, "walletSpendPct", current.walletSpendPct))),
  );

  // Transcription: reuse toggle.
  await setSetting("reuseTranscripts", formData.get("reuseTranscripts") === "on");

  // Site text: data-driven — rebuild the content dictionary from one field per
  // string (content.<namespace>.<key>), falling back to the current value.
  const currentContent = await getContent();
  const content = structuredClone(DEFAULT_CONTENT) as unknown as Record<
    string,
    Record<string, string>
  >;
  for (const ns of CONTENT_NAMESPACES) {
    for (const key of Object.keys(content[ns])) {
      const field = `content.${ns}.${key}`;
      const raw = formData.get(field);
      content[ns][key] =
        typeof raw === "string" && raw.length > 0
          ? raw.slice(0, 2000)
          : (currentContent as unknown as Record<string, Record<string, string>>)[ns][key];
    }
  }
  await setContent(content as unknown as Content);

  redirect("/developer/settings?saved=1");
}
