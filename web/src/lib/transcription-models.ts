import "server-only";

export const TRANSCRIPTION_PRICING_VERIFIED_ON = "2026-08-24";

export interface TranscriptionRouteInfo {
  tier: "Standard" | "Premium";
  role: string;
  provider: string;
  model: string;
  publishedCost: string;
  costDetail: string;
  routing: string;
  sourceUrl: string;
  sourceLabel: string;
  assumptionTier: "standard" | "premium";
  warning?: string;
}

export interface TranscriptionRoutingInfo {
  forcedBackend: string | null;
  routes: TranscriptionRouteInfo[];
}

const env = (key: string, fallback: string) => process.env[key]?.trim() || fallback;

/**
 * Mirrors the worker defaults in worker/worker/config.py and routing.py.
 * Environment values are read by the server so the developer portal shows the
 * deployment's configured model IDs without exposing API keys.
 */
export function getTranscriptionRoutingInfo(): TranscriptionRoutingInfo {
  const standardModel = env("STANDARD_MODEL", "whisper-large-v3-turbo");
  const premiumModel = env("PREMIUM_MODEL", "stt-async-v5");
  const forcedBackend = process.env.TRANSCRIBE_BACKEND?.trim() || null;

  return {
    forcedBackend,
    routes: [
      {
        tier: "Standard",
        role: "All Standard jobs",
        provider: "Groq",
        model: standardModel,
        publishedCost: "$0.040 / audio hour",
        costDetail: "Groq's published synchronous pay-as-you-go audio-hour rate.",
        routing: "Every Standard job, regardless of selected language.",
        sourceUrl: "https://console.groq.com/docs/speech-to-text",
        sourceLabel: "Groq speech-to-text pricing",
        assumptionTier: "standard",
        warning:
          standardModel === "whisper-large-v3-turbo"
            ? undefined
            : "The configured model differs from the priced Whisper Large V3 Turbo default.",
      },
      {
        tier: "Premium",
        role: "All Premium jobs",
        provider: "Soniox",
        model: premiumModel,
        publishedCost: "~$0.098 / typical audio hour",
        costDetail:
          "Token priced: Soniox estimates about 30k audio-input and 15k text-output tokens per typical hour. Actual cost varies with speech density.",
        routing: "Every Premium job. Speaker diarization is enabled only when requested and included in Premium settings.",
        sourceUrl: "https://soniox.com/pricing",
        sourceLabel: "Soniox pricing",
        assumptionTier: "premium",
        warning:
          premiumModel === "stt-async-v5"
            ? undefined
            : "The configured model differs from the priced Soniox async v5 default.",
      },
    ],
  };
}
