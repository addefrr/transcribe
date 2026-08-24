import { eq } from "drizzle-orm";
import { type Content, mergeContent } from "./content";
import { db } from "./db";
import {
  allowanceMinutes as legacyAllowanceMinutes,
  type Pack,
  type TierConfig,
  type TierFeatures,
  type TierKey,
} from "./pricing";
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
  /** Customer entitlement for one allowance window, configured explicitly. */
  allowanceMinutes: number;
  /** Kept optional only so older settings rows can be migrated on read. */
  capPct?: number;
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
  /** Customer-visible and server-enforced features included in each tier. */
  tierFeatures: Record<TierKey, TierFeatures>;
  subscriptionsEnabled: boolean;
  /** Let an admin temporarily see/use the product as if their subscription did not exist. */
  developerSubscriptionBypass: boolean;
  subscriptionPlans: SubscriptionPlan[];
  /** Max % of recorded customer payments we allow spending on transcription APIs. */
  walletSpendPct: number;
  /** Reuse an existing transcript for a repeat platform video (same tier etc.)
   *  instead of transcribing again. Dev can switch off to force fresh runs. */
  reuseTranscripts: boolean;
}

/** Customer-visible minute allowance for one usage period. */
export function planAllowanceMinutes(plan: SubscriptionPlan, s: Settings): number {
  // An annual plan pays for a year but grants the exact same allowance each
  // month as that tier's monthly plan. Never turn the annual price into a
  // single yearly audio pool.
  const allowancePlan =
    plan.interval === "year"
      ? s.subscriptionPlans.find((candidate) =>
          candidate.tier === plan.tier && candidate.interval === "month",
        ) ?? plan
      : plan;
  return Math.max(1, Math.floor(allowancePlan.allowanceMinutes));
}

export const DEFAULT_SETTINGS: Settings = {
  tiers: {
    standard: {
      label: "Standard",
      creditsPerMinute: 1,
      description:
        "Groq Whisper Large V3 Turbo for clear multilingual recordings, interviews, and videos.",
    },
    premium: {
      label: "Premium",
      creditsPerMinute: 2,
      description:
        "Soniox asynchronous transcription with optional speaker labels for meetings, interviews, and podcasts.",
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
  // Provider cost per audio-minute: Groq Turbo $0.04/hr and Soniox async v5
  // approximately $0.0975/hr for a typical hour. Used for internal estimates;
  // customer plan allowances remain explicit promises below.
  costPerMinuteCents: { standard: 4 / 60, premium: 9.75 / 60 },
  tierFeatures: {
    standard: {
      speakerLabels: false,
      textExport: true,
      subtitleExport: true,
      audioPlayback: true,
      publicSharing: true,
    },
    premium: {
      speakerLabels: true,
      textExport: true,
      subtitleExport: true,
      audioPlayback: true,
      publicSharing: true,
    },
  },
  subscriptionsEnabled: true,
  developerSubscriptionBypass: false,
  subscriptionPlans: [
    // Entitlements are explicit product promises, not a side effect of a mutable
    // provider-cost assumption. Annual plans receive the matching monthly
    // allowance each month; week passes receive one seven-day allowance.
    { id: "standard_monthly", tier: "standard", label: "Standard Monthly", interval: "month", priceUsdCents: 550, allowanceMinutes: 3000 },
    { id: "standard_annual", tier: "standard", label: "Standard Annual", interval: "year", priceUsdCents: 5500, allowanceMinutes: 3000 },
    { id: "standard_week", tier: "standard", label: "Standard Week Pass", interval: "week", priceUsdCents: 275, allowanceMinutes: 1380 },
    { id: "premium_monthly", tier: "premium", label: "Premium Monthly", interval: "month", priceUsdCents: 1650, allowanceMinutes: 3000 },
    { id: "premium_annual", tier: "premium", label: "Premium Annual", interval: "year", priceUsdCents: 16500, allowanceMinutes: 3000 },
    { id: "premium_week", tier: "premium", label: "Premium Week Pass", interval: "week", priceUsdCents: 825, allowanceMinutes: 1380 },
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
        if (row.key === "tierFeatures" && row.value && typeof row.value === "object") {
          const stored = row.value as Partial<Record<TierKey, Partial<TierFeatures>>>;
          merged.tierFeatures = {
            standard: { ...merged.tierFeatures.standard, ...stored.standard },
            premium: { ...merged.tierFeatures.premium, ...stored.premium },
          };
        } else if (row.key === "subscriptionPlans" && Array.isArray(row.value)) {
          // Upgrade legacy price/cost-derived plan rows in memory. Known plan
          // IDs receive today's explicit entitlement; custom legacy plans keep
          // their prior calculated allowance until an admin saves them.
          merged.subscriptionPlans = row.value
            .filter((value): value is Record<string, unknown> => Boolean(value && typeof value === "object"))
            .map((value) => {
              const fallback = DEFAULT_SETTINGS.subscriptionPlans.find(
                (candidate) => candidate.id === value.id,
              );
              const tier = value.tier === "premium" ? "premium" : "standard";
              const price = Number(value.priceUsdCents ?? fallback?.priceUsdCents ?? 100);
              const oldCap = Number(value.capPct ?? 50);
              const explicit = Number(value.allowanceMinutes);
              const migratedAllowance = Number.isFinite(explicit) && explicit > 0
                ? explicit
                : fallback?.allowanceMinutes ?? legacyAllowanceMinutes(
                    price,
                    oldCap,
                    merged.costPerMinuteCents[tier] || 0.1,
                  );
              return {
                ...(fallback ?? {}),
                ...value,
                tier,
                priceUsdCents: Math.max(50, Math.round(price)),
                allowanceMinutes: Math.max(1, Math.floor(migratedAllowance)),
              } as SubscriptionPlan;
            });
        } else {
          (merged as unknown as Record<string, unknown>)[row.key] = row.value;
        }
      }
    }
  } catch {
    // If settings can't be read (e.g. table missing pre-migration), fall back
    // to defaults rather than breaking the whole app.
  }
  // The production Standard route is Groq Whisper Large V3 Turbo, which does
  // not return speaker diarization. Never let a legacy/stale database override
  // advertise a feature the selected provider cannot deliver.
  merged.tierFeatures.standard.speakerLabels = false;
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

/** Commit the complete developer form as one change: either every section and
 * editable string is saved, or none is. */
export async function setSettingsAtomically(
  values: Partial<Settings>,
  content: Content,
): Promise<void> {
  const entries: Array<[string, unknown]> = [
    ...Object.entries(values),
    ["content", content],
  ];
  const updatedAt = new Date();
  await db.transaction(async (tx) => {
    for (const [key, value] of entries) {
      await tx
        .insert(settingsTable)
        .values({ key, value, updatedAt })
        .onConflictDoUpdate({
          target: settingsTable.key,
          set: { value, updatedAt },
        });
    }
  });
  cache = null;
  contentCache = null;
}
