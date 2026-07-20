// Single source of truth for what things cost.
// 1 credit = 1 minute of Standard-tier transcription.
//
// The credits/minute rate is copied into each job row at submission time, so
// changing these numbers never affects jobs already in flight. Which backend +
// model each tier maps to is the worker's concern (STANDARD_/PREMIUM_ env vars).

export const TIERS = {
  standard: {
    label: "Standard",
    creditsPerMinute: 1,
    description: "Fast, accurate transcription in ~99 languages (Whisper large-v3-turbo).",
  },
  premium: {
    label: "Premium",
    creditsPerMinute: 2,
    description:
      "Top accuracy for long recordings, noisy audio and heavy accents — best for meetings & podcasts.",
  },
} as const;

export type Tier = keyof typeof TIERS;

export function isTier(value: string): value is Tier {
  return value in TIERS;
}

export const PACKS = [
  { id: "starter", name: "Starter", credits: 100, amountUsdCents: 500 },
  { id: "creator", name: "Creator", credits: 500, amountUsdCents: 2000 },
  { id: "studio", name: "Studio", credits: 2000, amountUsdCents: 6000 },
] as const;

export type Pack = (typeof PACKS)[number];

export const SIGNUP_BONUS_CREDITS = 10;

/** Same rounding as the worker: whole minutes, rounded up, minimum one. */
export function estimateCredits(durationSeconds: number, tier: Tier): number {
  return Math.max(1, Math.ceil(durationSeconds / 60)) * TIERS[tier].creditsPerMinute;
}
