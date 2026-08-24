import type { TierKey } from "./pricing";

/**
 * Capabilities of the route the worker will actually call.
 *
 * Hosted Standard uses Groq Whisper, which does not return speaker identities;
 * hosted Premium uses Soniox, which does. The fake backend intentionally
 * supports labels for development UI tests. Local faster-whisper does not.
 */
export function routeSupportsSpeakerLabels(tier: TierKey): boolean {
  const forced = process.env.TRANSCRIBE_BACKEND?.trim();
  if (forced) return forced === "soniox" || forced === "fake";
  return tier === "premium";
}
