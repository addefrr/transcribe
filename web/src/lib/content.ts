// Editable site copy. Client-safe (no DB import) like pricing.ts: this holds the
// DEFAULT strings; the developer portal stores per-key overrides in the settings
// table under the "content" key, deep-merged over these defaults by getContent()
// (server) and delivered to client components via ContentProvider.
//
// Strings with {placeholders} are filled at render time with fill(); this keeps
// dynamic values (credit counts, durations) in code while the wording stays
// fully editable.

export const DEFAULT_CONTENT = {
  nav: {
    brand: "Transcribe",
    myTranscriptions: "My transcriptions",
    plans: "Plans",
    developer: "Developer",
    subscribed: "Subscribed",
    creditsLabel: "credits",
    logIn: "Log in",
    logOut: "Log out",
    getStarted: "Get started",
  },
  footer: {
    tagline: "Transcribe — audio & video to text",
    plans: "Plans",
    extension: "Extension",
    logIn: "Log in",
  },
  landing: {
    badge: "Accurate transcripts in 100+ languages",
    heroTitle: "Turn audio & video into text you can actually use.",
    heroSubtitle:
      "Upload, paste a link, or record — and get a clean, accurate transcript with timestamps and speaker labels in minutes. Pay only for what you use.",
    ctaPrimary: "Start free with {credits} credits",
    ctaSecondary: "See plans",
    step1Title: "Add credits",
    step1Body:
      "Start with {credits} free — no card required. Top up any time, or go unlimited with a plan.",
    step2Title: "Drop in audio",
    step2Body: "Upload a file, paste a link (YouTube included), or record straight from your mic.",
    step3Title: "Get your transcript",
    step3Body:
      "Read it with timestamps and speakers, play along, and export text or subtitles.",
    qualityHeading: "Two quality levels",
    qualitySubheading: "Pick per job — pay more only when you need the extra accuracy.",
    creditsPerMinSuffix: "/min",
    pricingHeading: "Simple credit packs",
    pricingSubheading: "One credit ≈ one minute of Standard audio. No subscription required.",
    mostPopular: "Most popular",
    creditsLabel: "credits",
    pricingCta: "Create your free account",
  },
  dashboard: {
    heading: "My transcriptions",
    planLeft: "{plan} plan",
    periodLeft: "{hours}h left this period",
    creditsLeft: "You have {credits} credits left",
    goUnlimited: "Go unlimited",
  },
  newJob: {
    heading: "Start a transcription",
    tabUpload: "Upload a file",
    tabUrl: "Paste a link",
    tabRecord: "Record",
    urlPlaceholder: "Paste a YouTube or audio/video link…",
    playlistLabel: "Transcribe the whole playlist",
    playlistHint: "— we'll show the total price first",
    perMin: "/min",
    languageLabel: "Language",
    autoDetect: "Auto-detect (recommended)",
    langBest: "Best supported",
    langAll: "All languages",
    languageHelp:
      "Leave this on Auto-detect and we'll figure it out. If you already know the language, choosing it can improve accuracy.",
    recognizeSpeakers: "Recognize speakers",
    speakersHelp: "label who's talking (uses Premium)",
    submit: "Start transcription",
    estimate: "About {credits} credits (~${dollars}) · {minutes} min",
    estimateChecking: "Checking length…",
    estimateCached: "Already transcribed — instant ⚡",
    estimateUrlUnknown: "We'll work out the cost from the length before we start.",
    busyUploading: "Uploading…",
    busyReadingPlaylist: "Reading playlist…",
    busyQueueing: "Queueing job…",
    queued: "All set! Your transcription is in progress below.",
    errChooseFile: "Choose a file first.",
    errRecordFirst: "Record something first.",
    errPasteUrl: "Paste a URL first.",
  },
  recorder: {
    start: "Start recording",
    recordAgain: "Record again",
    pause: "Pause",
    resume: "Resume",
    stop: "Stop",
    paused: "Paused",
    ready: "Recorded {time} — ready to transcribe.",
    micError: "Couldn't access your microphone. Check your browser permissions.",
  },
  jobDetail: {
    back: "← Back to my transcriptions",
    creditsUsed: "{credits} credits used",
    creditsReserved: "{credits} credits reserved",
    failed: "Something went wrong — you weren't charged, your credits were returned.",
    downloadTxt: "Text file",
    downloadSrt: "Subtitles (SRT)",
    downloadVtt: "Subtitles (VTT)",
    shareHeading: "Share this transcript",
    shareOnBody: "Anyone with the link can read it — no account needed.",
    shareOffBody: "Create a public read-only link you can send to anyone.",
    shareCreate: "Create share link",
    shareStop: "Stop sharing",
    shareCopy: "Copy",
    shareCopied: "Copied!",
    shareOpen: "Open",
    notFound: "Job not found.",
  },
  auth: {
    loginTitle: "Welcome back",
    loginCta: "Log in",
    loginAlt: "New here?",
    loginAltLink: "Create an account",
    signupTitle: "Create your account",
    signupTitleBonus: "Create your account — get {credits} free credits",
    signupCta: "Sign up",
    signupAlt: "Already have an account?",
    signupAltLink: "Log in",
    emailLabel: "Email",
    passwordLabel: "Password",
    passwordHint: "(min. 8 characters)",
    forgot: "Forgot?",
    resetNotice: "Your password has been updated. Please log in.",
    verifiedNotice: "Your email is verified. Please log in.",
    forgotTitle: "Reset your password",
    forgotBody: "Enter your email and we'll send you a link to choose a new password.",
    forgotCta: "Send reset link",
    forgotBack: "Remembered it?",
    resetTitle: "Choose a new password",
    resetCta: "Update password",
    verifyBanner: "Please verify your email to secure your account.",
    verifyResend: "Resend verification email",
  },
  plans: {
    heading: "Subscribe & save",
    subheading: "Unlimited transcriptions for a flat price — no counting credits.",
    activePlan: "Active plan: {label}",
    currentPlan: "Current plan",
    choosePlan: "Choose plan",
    audioIncluded: "Up to {hours} of audio included.",
    payg: "Prefer pay-as-you-go?",
    paygLink: "Buy credits instead",
  },
  developer: {
    portalTitle: "Developer portal",
    settings: "Settings",
    revenueHeading: "Revenue & profit",
    walletHeading: "Spend wallet",
    unitHeading: "Unit economics (per credit sold)",
    customersUsageHeading: "Customers & usage",
    customersHeading: "Customers",
    noCustomers: "No customers yet.",
    settingsTitle: "Settings",
    settingsBack: "← Back to portal",
    settingsIntro: "Changes apply within a few seconds and never affect jobs already in progress.",
    settingsSaved: "Saved.",
  },
  credits: {
    heading: "Your credits",
    balance: "You have {credits} credits — about {credits} minutes of Standard transcription.",
    creditsWord: "credits",
    successNotice: "Thank you! Your credits have been added. (It can take a few seconds to appear.)",
    canceledNotice: "No problem — nothing was charged.",
    activityHeading: "Activity",
    activityEmpty: "Nothing here yet.",
    buyCta: "Buy for ${dollars}",
  },
} as const;

// A deep-ish content type: each namespace is a flat record of string values.
export type Content = {
  [Ns in keyof typeof DEFAULT_CONTENT]: Record<keyof (typeof DEFAULT_CONTENT)[Ns], string>;
};

export const CONTENT_NAMESPACES = Object.keys(DEFAULT_CONTENT) as (keyof Content)[];

// Fill {placeholders} in a template with the given values.
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) =>
    k in vars ? String(vars[k]) : `{${k}}`,
  );
}

// Deep-merge stored overrides over the defaults. Only known namespaces/keys are
// applied, so a stray or stale settings row can't corrupt the shape.
export function mergeContent(overrides: unknown): Content {
  const out = structuredClone(DEFAULT_CONTENT) as unknown as Record<string, Record<string, string>>;
  if (overrides && typeof overrides === "object") {
    for (const [ns, vals] of Object.entries(overrides as Record<string, unknown>)) {
      if (!(ns in out) || !vals || typeof vals !== "object") continue;
      for (const [key, val] of Object.entries(vals as Record<string, unknown>)) {
        if (key in out[ns] && typeof val === "string") out[ns][key] = val;
      }
    }
  }
  return out as unknown as Content;
}
