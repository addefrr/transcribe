import { eq } from "drizzle-orm";
import { type Content, mergeContent } from "./content";
import { db } from "./db";
import { allowanceMinutes, type Pack, type TierConfig, type TierKey } from "./pricing";
import { settings as settingsTable } from "./schema";

// Admin-editable configuration. Code holds the defaults; the `settings` table
// holds per-key overrides that the developer portal edits. Everything the admin
// can tune lives here so there's one source of truth.

export type { Pack, TierConfig, TierKey } from "./pricing";

export interface SubscriptionPlan {
  id: string; // e.g. "standard_monthly"
  tier: TierKey; // tier this unlocks; "premium" also covers "standard"
  label: string;
  interval: "month" | "year" | "week"; // week = one-time 7-day pass
  priceUsdCents: number;
  /** Fair-use: usage is capped so our compute cost stays under this % of price. */
  capPct: number;
}

export interface Settings {
  tiers: Record<TierKey, TierConfig>;
  packs: Pack[];
  signupBonusCredits: number;
  /** Price of one credit when buying a custom amount, in cents. */
  usdCentsPerCredit: number;
  /** Minimum custom purchase, in cents. */
  minPurchaseUsdCents: number;
  /** Estimated API/compute cost per audio-minute, per tier, in cents. */
  costPerMinuteCents: Record<TierKey, number>;
  subscriptionsEnabled: boolean;
  subscriptionPlans: SubscriptionPlan[];
  /** Max % of net revenue we allow spending on transcription APIs. */
  walletSpendPct: number;
  /** Reuse an existing transcript for a repeat platform video (same tier etc.)
   *  instead of transcribing again. Dev can switch off to force fresh runs. */
  reuseTranscripts: boolean;
}

/** Fair-use minute allowance for a plan's period: price × cap% ÷ cost/minute. */
export function planAllowanceMinutes(plan: SubscriptionPlan, s: Settings): number {
  return allowanceMinutes(plan.priceUsdCents, plan.capPct, s.costPerMinuteCents[plan.tier] || 0.1);
}

export const DEFAULT_SETTINGS: Settings = {
  tiers: {
    standard: {
      label: "Standard",
      creditsPerMinute: 1,
      description:
        "Great quality at the best price. Ideal for clear recordings, interviews and videos.",
    },
    premium: {
      label: "Premium",
      creditsPerMinute: 2,
      description:
        "Our most accurate option. Best for noisy audio, strong accents, meetings and podcasts.",
    },
  },
  packs: [
    { id: "starter", name: "Starter", credits: 100, amountUsdCents: 500 },
    { id: "creator", name: "Creator", credits: 500, amountUsdCents: 2000 },
    { id: "studio", name: "Studio", credits: 2000, amountUsdCents: 6000 },
  ],
  signupBonusCredits: 10,
  usdCentsPerCredit: 4, // matches the Creator pack rate ($20 / 500)
  minPurchaseUsdCents: 100, // $1
  // Rough API cost per audio-minute: Standard (Qwen/Groq ~$0.04/hr ≈ 0.07¢/min),
  // Premium (AssemblyAI ~$0.30/hr = 0.5¢/min). Drives the fair-use allowance.
  costPerMinuteCents: { standard: 0.1, premium: 0.5 },
  subscriptionsEnabled: true,
  subscriptionPlans: [
    // "annual = half the monthly rate" → 6× monthly for the year (50% off).
    // "week pass = half the monthly price" → one-time 7-day pass.
    { id: "standard_monthly", tier: "standard", label: "Standard Monthly", interval: "month", priceUsdCents: 550, capPct: 50 },
    { id: "standard_annual", tier: "standard", label: "Standard Annual", interval: "year", priceUsdCents: 3300, capPct: 50 },
    { id: "standard_week", tier: "standard", label: "Standard Week Pass", interval: "week", priceUsdCents: 275, capPct: 50 },
    { id: "premium_monthly", tier: "premium", label: "Premium Monthly", interval: "month", priceUsdCents: 1200, capPct: 50 },
    { id: "premium_annual", tier: "premium", label: "Premium Annual", interval: "year", priceUsdCents: 7200, capPct: 50 },
    { id: "premium_week", tier: "premium", label: "Premium Week Pass", interval: "week", priceUsdCents: 600, capPct: 50 },
  ],
  walletSpendPct: 80,
  reuseTranscripts: true,
};

// Short-TTL cache so hot paths (job submit, every page render) don't hit the DB
// on every call, while admin edits still show up within a few seconds.
const CACHE_TTL_MS = 5000;
let cache: { at: number; value: Settings } | null = null;

export async function getSettings(): Promise<Settings> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;
  const merged: Settings = structuredClone(DEFAULT_SETTINGS);
  try {
    const rows = await db.select().from(settingsTable);
    for (const row of rows) {
      // Overlay each stored key onto the defaults (shallow per top-level key).
      // Only recognized keys are applied, so stray rows can't corrupt the shape.
      if (row.key in merged) {
        (merged as unknown as Record<string, unknown>)[row.key] = row.value;
      }
    }
  } catch {
    // If settings can't be read (e.g. table missing pre-migration), fall back
    // to defaults rather than breaking the whole app.
  }
  cache = { at: Date.now(), value: merged };
  return merged;
}

export async function setSetting<K extends keyof Settings>(
  key: K,
  value: Settings[K],
): Promise<void> {
  await db
    .insert(settingsTable)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settingsTable.key,
      set: { value, updatedAt: new Date() },
    });
  cache = null; // invalidate so the next read reflects the change immediately
}

// Editable site copy lives under its own "content" settings key and is
// deep-merged over the code defaults (mergeContent), so new default strings
// added in code stay present even against an older stored override.
let contentCache: { at: number; value: Content } | null = null;

export async function getContent(): Promise<Content> {
  if (contentCache && Date.now() - contentCache.at < CACHE_TTL_MS) return contentCache.value;
  let overrides: unknown = null;
  try {
    const [row] = await db
      .select()
      .from(settingsTable)
      .where(eq(settingsTable.key, "content"))
      .limit(1);
    overrides = row?.value ?? null;
  } catch {
    // Table missing pre-migration, etc. — fall back to defaults.
  }
  const value = mergeContent(overrides);
  contentCache = { at: Date.now(), value };
  return value;
}

export async function setContent(value: Content): Promise<void> {
  await db
    .insert(settingsTable)
    .values({ key: "content", value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settingsTable.key,
      set: { value, updatedAt: new Date() },
    });
  contentCache = null;
}
