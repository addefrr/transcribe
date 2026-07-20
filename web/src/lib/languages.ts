// Source of truth for the submission language selector and server-side
// validation. `qwen: true` marks languages Qwen3-ASR-Flash covers well — for the
// Standard tier the worker routes those to Qwen and everything else to Whisper
// large-v3-turbo. The `qwen` flag here is display-only (a hint in the UI); the
// authoritative routing set lives in the worker (QWEN_LANGUAGES). Keep them in
// sync.

export const LANGUAGES = [
  // Qwen3-ASR-Flash supported languages
  { code: "zh", name: "Chinese", qwen: true },
  { code: "en", name: "English", qwen: true },
  { code: "ja", name: "Japanese", qwen: true },
  { code: "ko", name: "Korean", qwen: true },
  { code: "ar", name: "Arabic", qwen: true },
  { code: "fr", name: "French", qwen: true },
  { code: "de", name: "German", qwen: true },
  { code: "es", name: "Spanish", qwen: true },
  { code: "it", name: "Italian", qwen: true },
  { code: "pt", name: "Portuguese", qwen: true },
  { code: "ru", name: "Russian", qwen: true },
  // Long-tail languages (routed to Whisper large-v3-turbo on Standard)
  { code: "hi", name: "Hindi" },
  { code: "tr", name: "Turkish" },
  { code: "pl", name: "Polish" },
  { code: "nl", name: "Dutch" },
  { code: "uk", name: "Ukrainian" },
  { code: "vi", name: "Vietnamese" },
  { code: "id", name: "Indonesian" },
  { code: "th", name: "Thai" },
  { code: "sv", name: "Swedish" },
  { code: "da", name: "Danish" },
  { code: "no", name: "Norwegian" },
  { code: "fi", name: "Finnish" },
  { code: "he", name: "Hebrew" },
  { code: "el", name: "Greek" },
  { code: "cs", name: "Czech" },
  { code: "ro", name: "Romanian" },
  { code: "hu", name: "Hungarian" },
  { code: "fa", name: "Persian" },
  { code: "ta", name: "Tamil" },
  { code: "sw", name: "Swahili" },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];

const CODES = new Set(LANGUAGES.map((l) => l.code));

export function isLanguageCode(value: string): value is LanguageCode {
  return CODES.has(value as LanguageCode);
}
