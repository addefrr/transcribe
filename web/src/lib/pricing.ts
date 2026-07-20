// Client-safe pricing primitives (types, tier keys, pure helpers). No DB import,
// so this is safe to import from client components. The editable *values* (rates,
// packs, prices) live in web/src/lib/settings.ts (server-only, DB-backed).

export type TierKey = "standard" | "premium";
export type Tier = TierKey; // backwards-compatible alias

export interface TierConfig {
  label: string;
  creditsPerMinute: number;
  description: string;
}

export interface Pack {
  id: string;
  name: string;
  credits: number;
  amountUsdCents: number;
}

export const TIER_KEYS: TierKey[] = ["standard", "premium"];

export function isTier(value: string): value is TierKey {
  return value === "standard" || value === "premium";
}

/** Whole minutes, rounded up, minimum one — matches the worker's billing. */
export function estimateCredits(durationSeconds: number, creditsPerMinute: number): number {
  return Math.max(1, Math.ceil(durationSeconds / 60)) * creditsPerMinute;
}
