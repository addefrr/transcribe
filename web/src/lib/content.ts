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
    account: "Account",
    developer: "Developer",
    subscribed: "Subscribed",
    creditsLabel: "credits",
    logIn: "Log in",
    logOut: "Log out",
    getStarted: "Get started",
  },
  footer: {
    tagline: "Transcribe — audio & video to text",
    productHeading: "Product",
    helpHeading: "Help",
    legalHeading: "Legal",
    plans: "Plans",
    extension: "Extension",
    billing: "Billing guide",
    support: "Support",
    privacy: "Privacy",
    terms: "Terms",
    logIn: "Log in",
  },
  landing: {
    badge: "Audio in. Reviewable text out.",
    heroTitle: "Move from recording to a transcript you can work with.",
    heroSubtitle:
      "Upload audio or video, paste a media link, or record in your browser. Review timestamped speech-to-text output, then export text or subtitles when your selected tier includes them.",
    ctaPrimary: "Create an account — verify for {credits} trial credits",
    ctaPrimaryNoBonus: "Create an account",
    ctaSecondary: "See credit prices",
    exampleEyebrow: "Illustrative transcript output",
    exampleTitle: "Project check-in",
    exampleMeta: "00:42 recording · English",
    exampleSpeakerOne: "Speaker 1",
    exampleSpeakerTwo: "Speaker 2",
    exampleLineOne: "Let's move the launch review to Thursday morning.",
    exampleLineTwo: "I'll send the revised notes before noon tomorrow.",
    exampleLineThree: "Great. Add the accessibility checks to the agenda.",
    exampleNotice:
      "This is an illustrative example, not a promise for every recording. Automated transcripts can contain errors.",
    workflowHeading: "A short path from source to usable text",
    workflowIntro:
      "The interface keeps the source, processing choice, estimate, and result in one understandable flow.",
    step1Title: "Create and verify your account",
    step1Body:
      "Verify your email to receive {credits} trial credits. No payment card is needed for the trial.",
    step1BodyNoBonus:
      "Verify your email to finish setting up the account before you start a transcription.",
    step2Title: "Add the recording",
    step2Body: "Upload a file, paste a supported media link, or record directly from your microphone.",
    step3Title: "Review before relying on it",
    step3Body:
      "Read the timestamped result, check important names and numbers, and export the formats included in your tier.",
    qualityHeading: "Choose by features and cost",
    qualitySubheading:
      "The processing options are compared directly. The exact estimate is shown before a job starts.",
    creditsPerMinSuffix: "/min",
    comparisonCaption: "Transcription tier feature comparison",
    rateLabel: "Credits per audio minute",
    includedLabel: "Included",
    notIncludedLabel: "Not included",
    reviewHeading: "Built for review, not blind trust",
    reviewBody:
      "Speech recognition is automated and can mishear names, numbers, overlapping voices, or unclear audio. Check consequential content against the recording before you publish or act on it.",
    reviewPointOne: "Timestamps keep the output connected to its source.",
    reviewPointTwo: "Speaker labels appear only when offered by the selected tier and enabled for the job.",
    reviewPointThree: "Failed jobs return reserved credits instead of charging for a missing result.",
    pricingHeading: "Pay as you go without guessing the rate",
    pricingSubheading:
      "Buy credits without a subscription. Pack quantity, price, and effective price per credit are shown together.",
    packLabel: "Pack",
    creditsLabel: "credits",
    perCreditLabel: "per credit",
    billingGuide: "Read how credits, plans, tax, renewals, and refunds work",
    pricingCta: "Create an account to start",
  },
  dashboard: {
    heading: "My transcriptions",
    planLeft: "{plan} plan",
    periodLeft: "{hours}h left this period",
    creditsLeft: "You have {credits} credits left",
    goUnlimited: "Compare plans",
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
    autoDetect: "Auto-detect",
    langBest: "Common languages",
    langAll: "All languages",
    languageHelp:
      "Leave this on Auto-detect if you are unsure. If you know the language, select it so the system does not have to infer it.",
    recognizeSpeakers: "Recognize speakers",
    speakersHelp: "label who's talking (uses Premium)",
    submit: "Start transcription",
    estimate: "About {credits} credits (~${dollars}) · {minutes} min",
    estimateIncluded: "Included in your plan · {minutes} min left this month",
    includedInPlan: "included in your plan",
    estimateChecking: "Checking length…",
    estimateCached: "An earlier transcript is available for this source",
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
    signupTitleBonus: "Create your account — verify for {credits} trial credits",
    signupCta: "Sign up",
    signupAlt: "Already have an account?",
    signupAltLink: "Log in",
    emailLabel: "Email",
    passwordLabel: "Password",
    passwordHint: "Use at least 8 characters.",
    forgot: "Forgot?",
    loggingIn: "Logging in…",
    signingUp: "Creating account…",
    resetNotice: "Your password has been updated. Please log in.",
    verifiedNotice: "Your email is verified. Please log in.",
    forgotTitle: "Reset your password",
    forgotBody: "Enter your email and we'll send you a link to choose a new password.",
    forgotCta: "Send reset link",
    sendingReset: "Sending reset link…",
    forgotBack: "Remembered it?",
    resetTitle: "Choose a new password",
    resetCta: "Update password",
    updatingPassword: "Updating password…",
    verifyBanner: "Verify your email to finish setting up your account.",
    verifyBannerBonus: "Verify your email to receive your {credits} trial credits.",
    verifyResend: "Resend verification email",
    sendingVerification: "Sending verification email…",
  },
  plans: {
    heading: "Subscribe & save",
    subheading:
      "Choose a fixed-period transcription allowance. Your plan is used before any backup credits.",
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
    modelsHeading: "Transcription models & API cost",
    modelsIntro:
      "Published pay-as-you-go prices per processed audio hour. Compare them with the internal assumptions used for wallet and subscription calculations.",
    revenueHeading: "Payments & direct contribution",
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
    balance: "You have {credits} credits available for pay-as-you-go transcription.",
    subscribedHeading: "Your backup credits",
    subscribedBalance:
      "Your subscription covers included transcription without using credits. You have {credits} backup credits, used only after your plan ends or its monthly allowance is used.",
    subscribedTopUpHeading: "Keep backup credits",
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

/** Validate editable copy at the server boundary, not only in the editor UI. */
export function contentValueProblem(ns: string, key: string, value: string): string | null {
  const defaults = DEFAULT_CONTENT as unknown as Record<string, Record<string, string>>;
  const template = defaults[ns]?.[key];
  if (typeof template !== "string") return "Unknown content field.";
  if (value.trim().length === 0) return "Text cannot be empty.";
  const required = Array.from(new Set(template.match(/\{[^{}]+\}/g) ?? []));
  const missing = required.filter((placeholder) => !value.includes(placeholder));
  return missing.length > 0
    ? `Keep ${missing.join(", ")} so live values still appear.`
    : null;
}

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
        if (
          key in out[ns] &&
          typeof val === "string" &&
          contentValueProblem(ns, key, val) === null
        ) {
          out[ns][key] = val;
        }
      }
    }
  }
  return out as unknown as Content;
}
