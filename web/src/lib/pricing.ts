// Single source of truth for what things cost.
// 1 credit = 1 minute of Standard-tier transcription.
//
// The credits/minute rate is copied into each job row at submission time, so
// changing these numbers never affects jobs already in flight. Which Whisper
// model each tier maps to is the worker's concern (WHISPER_MODEL_* env vars).

export const TIERS = {
  standard: {
    label: "Standard",
    creditsPerMinute: 1,
    description: "Fast and accurate for clear recordings (Whisper small).",
  },
  premium: {
    label: "Premium",
    creditsPerMinute: 2,
    description:
      "Highest accuracy for noisy audio, heavy accents and 90+ languages (Whisper large-v3).",
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
