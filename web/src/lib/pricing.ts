// Client-safe pricing primitives (types, tier keys, pure helpers). No DB import,
// so this is safe to import from client components. The editable *values* (rates,
// packs, prices) live in web/src/lib/settings.ts (server-only, DB-backed).

export type TierKey = "standard" | "premium";
export type Tier = TierKey; // backwards-compatible alias

export const TIER_FEATURE_KEYS = [
  "speakerLabels",
  "textExport",
  "subtitleExport",
  "audioPlayback",
  "publicSharing",
] as const;
export type TierFeatureKey = (typeof TIER_FEATURE_KEYS)[number];
export type TierFeatures = Record<TierFeatureKey, boolean>;

export const TIER_FEATURE_LABELS: Record<TierFeatureKey, string> = {
  speakerLabels: "Speaker labels",
  textExport: "Text export",
  subtitleExport: "SRT & VTT subtitle exports",
  audioPlayback: "Synced audio playback",
  publicSharing: "Public share links",
};

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

/**
 * Legacy migration helper for old price/cost-derived subscription rows.
 * Current plan entitlements are configured explicitly in settings and do not
 * change when a provider cost assumption changes.
 *
 * allowance = (plan price ÷ our compute cost per minute) × cap%
 *           = price × cap% ÷ cost-per-minute
 *
 * `costPerMinuteCents` is OUR cost to transcribe a minute of audio (what the
 * admin enters, per hour, and we store as ¢/min). So the cap is a share of the
 * audio our own cost would buy for that subscription's price — not the user's.
 */
export function allowanceMinutes(
  priceUsdCents: number,
  capPct: number,
  costPerMinuteCents: number,
): number {
  const cost = costPerMinuteCents > 0 ? costPerMinuteCents : 0.1;
  return Math.max(1, Math.floor((priceUsdCents * (capPct / 100)) / cost));
}

// Admins think in dollars-per-hour of audio (how ASR providers quote); we store
// cents-per-minute. These convert between the two.
export function costPerHourUsd(costPerMinuteCents: number): number {
  return (costPerMinuteCents * 60) / 100;
}
export function costPerMinuteCentsFromHourUsd(dollarsPerHour: number): number {
  return (dollarsPerHour * 100) / 60;
}
