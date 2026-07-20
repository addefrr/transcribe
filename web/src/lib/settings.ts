import { db } from "./db";
import type { Pack, TierConfig, TierKey } from "./pricing";
import { settings as settingsTable } from "./schema";

// Admin-editable configuration. Code holds the defaults; the `settings` table
// holds per-key overrides that the developer portal edits. Everything the admin
// can tune lives here so there's one source of truth.

export type { Pack, TierConfig, TierKey } from "./pricing";

export interface Settings {
  tiers: Record<TierKey, TierConfig>;
  packs: Pack[];
  signupBonusCredits: number;
  /** Price of one credit when buying a custom amount, in cents. */
  usdCentsPerCredit: number;
  /** Minimum custom purchase, in cents. */
  minPurchaseUsdCents: number;
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
