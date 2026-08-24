"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import {
  type Content,
  CONTENT_NAMESPACES,
  contentValueProblem,
  DEFAULT_CONTENT,
} from "@/lib/content";
import {
  costPerHourUsd,
  costPerMinuteCentsFromHourUsd,
  TIER_FEATURE_KEYS,
  TIER_KEYS,
  type TierFeatures,
} from "@/lib/pricing";
import {
  getContent,
  getSettings,
  setSettingsAtomically,
  type Settings,
  type Pack,
  type SubscriptionPlan,
  type TierConfig,
} from "@/lib/settings";

function num(form: FormData, name: string, fallback: number): number {
  const v = Number(form.get(name));
  return Number.isFinite(v) ? v : fallback;
}

export type SettingsActionState = { error?: string };

class SettingsInputError extends Error {}

async function persistSettings(formData: FormData): Promise<void> {
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

  // Features are enforced by the relevant API routes as well as reflected in
  // the UI. Groq cannot produce speaker labels, so that capability can only be
  // offered on Premium's Soniox route.
  const tierFeatures = structuredClone(current.tierFeatures);
  for (const key of TIER_KEYS) {
    tierFeatures[key] = Object.fromEntries(
      TIER_FEATURE_KEYS.map((feature) => [
        feature,
        feature === "speakerLabels" && key === "standard"
          ? false
          : formData.get(`feature_${key}_${feature}`) === "on",
      ]),
    ) as TierFeatures;
  }

  // Packs: edit existing packs in place (name / credits / price).
  const packs: Pack[] = current.packs.map((p) => ({
    id: p.id,
    name: String(formData.get(`pack_${p.id}_name`) ?? p.name).slice(0, 40),
    credits: Math.max(1, Math.round(num(formData, `pack_${p.id}_credits`, p.credits))),
    amountUsdCents: Math.max(50, Math.round(num(formData, `pack_${p.id}_cents`, p.amountUsdCents))),
  }));

  const signupBonusCredits = Math.max(
    0,
    Math.round(num(formData, "signupBonusCredits", current.signupBonusCredits)),
  );
  const usdCentsPerCredit = Math.max(
    0.0001,
    num(formData, "usdCentsPerCredit", current.usdCentsPerCredit),
  );
  const minPurchaseUsdCents = Math.max(
    50,
    Math.round(num(formData, "minPurchaseUsdCents", current.minPurchaseUsdCents)),
  );

  // Subscriptions: toggle, provider-cost reporting, and explicit customer
  // price/allowance promises. Allowances must not silently change with costs.
  const subscriptionsEnabled = formData.get("subscriptionsEnabled") === "on";
  const developerSubscriptionBypass =
    formData.get("developerSubscriptionBypass") === "on";
  // The form submits our cost as $/hour of audio; store it as ¢/min.
  const costHourStd = num(
    formData,
    "cost_standard",
    costPerHourUsd(current.costPerMinuteCents.standard),
  );
  const costHourPrem = num(
    formData,
    "cost_premium",
    costPerHourUsd(current.costPerMinuteCents.premium),
  );
  const costPerMinuteCents = {
    standard: Math.max(0.0001, costPerMinuteCentsFromHourUsd(costHourStd)),
    premium: Math.max(0.0001, costPerMinuteCentsFromHourUsd(costHourPrem)),
  };
  const submittedPlans: SubscriptionPlan[] = current.subscriptionPlans.map((plan) => ({
    ...plan,
    label: String(formData.get(`plan_${plan.id}_label`) ?? plan.label).slice(0, 60),
    priceUsdCents: Math.max(50, Math.round(num(formData, `plan_${plan.id}_cents`, plan.priceUsdCents))),
    allowanceMinutes: Math.max(
      1,
      Math.round(
        num(formData, `plan_${plan.id}_allowance`, plan.allowanceMinutes),
      ),
    ),
  }));
  // Annual billing changes the payment cadence, not the monthly entitlement.
  // Normalize this server-side as well as showing the annual field read-only,
  // so a crafted form submission cannot create contradictory plan promises.
  const plans: SubscriptionPlan[] = submittedPlans.map((plan) => {
    if (plan.interval !== "year") return plan;
    const monthly = submittedPlans.find(
      (candidate) => candidate.tier === plan.tier && candidate.interval === "month",
    );
    return monthly ? { ...plan, allowanceMinutes: monthly.allowanceMinutes } : plan;
  });
  const walletSpendPct = Math.min(
    100,
    Math.max(1, num(formData, "walletSpendPct", current.walletSpendPct)),
  );
  const reuseTranscripts = formData.get("reuseTranscripts") === "on";

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
      const value =
        typeof raw === "string" && raw.length > 0
          ? raw.slice(0, 2000)
          : (currentContent as unknown as Record<string, Record<string, string>>)[ns][key];
      const problem = contentValueProblem(ns, key, value);
      if (problem) throw new SettingsInputError(`${ns}.${key}: ${problem}`);
      content[ns][key] = value;
    }
  }
  const values: Partial<Settings> = {
    tiers,
    tierFeatures,
    packs,
    signupBonusCredits,
    usdCentsPerCredit,
    minPurchaseUsdCents,
    subscriptionsEnabled,
    developerSubscriptionBypass,
    costPerMinuteCents,
    subscriptionPlans: plans,
    walletSpendPct,
    reuseTranscripts,
  };
  await setSettingsAtomically(values, content as unknown as Content);
}

export async function saveSettings(
  _previous: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const user = await getCurrentUser();
  if (!isAdmin(user)) redirect("/dashboard");

  try {
    await persistSettings(formData);
  } catch (error) {
    console.error("Could not save developer settings", error);
    return {
      error: error instanceof SettingsInputError
        ? error.message
        : "Settings could not be saved. No changes were applied; review the form and try again.",
    };
  }

  redirect("/developer/settings?saved=1");
}
