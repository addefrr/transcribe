import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  emailVerified: boolean("email_verified").notNull().default(false),
  creditBalance: integer("credit_balance").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// One-time tokens for email verification and password reset. We store only the
// sha256 of the token; the raw value lives only in the emailed link, so a DB
// leak can't be replayed. Rows are single-use (used_at) and time-limited.
export const authTokens = pgTable(
  "auth_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // verify | reset
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("auth_tokens_hash_idx").on(t.tokenHash)],
);

// Long-lived personal access tokens for the browser extension / API. We store
// only the sha256 of the token; the raw "sk_…" value is shown once at creation
// and never again, so a DB leak can't be replayed. Bearer-authenticated via
// getRequestUser().
export const apiTokens = pgTable(
  "api_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("api_tokens_user_idx").on(t.userId)],
);

export type ApiToken = typeof apiTokens.$inferSelect;

// id is the sha256 of the cookie token, so a leaked DB dump can't be replayed.
export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Shared fixed-window abuse controls. Keeping these buckets in Postgres makes
// limits consistent across serverless instances and restarts.
export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").primaryKey(), // sha256 of the logical bucket key
    count: integer("count").notNull(),
    resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("rate_limits_reset_idx").on(t.resetAt)],
);

// Non-identifying lifetime counters retained when a customer deletes a job or
// account. This lets privacy deletion remove customer-linked rows without
// rewriting the platform's historical revenue, provider-spend, and usage
// totals. Each key is an additive numeric metric.
export const platformMetrics = pgTable("platform_metrics", {
  key: text("key").primaryKey(),
  value: doublePrecision("value").notNull().default(0),
});

// Append-only audit trail; users.credit_balance is updated in the same
// transaction as every insert here, so SUM(delta) always equals the balance.
export const creditLedger = pgTable("credit_ledger", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  delta: integer("delta").notNull(),
  reason: text("reason").notNull(), // signup_bonus | purchase | hold | refund
  // Tax-exclusive payment value used for operational reporting. Historical
  // rows written before this field was normalized may contain the gross total.
  amountUsdCents: integer("amount_usd_cents"),
  jobId: uuid("job_id"),
  stripeEventId: text("stripe_event_id").unique(), // idempotency key for webhooks
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const jobs = pgTable("jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  sourceType: text("source_type").notNull(), // upload | url
  sourceUrl: text("source_url"),
  // Canonical "<extractor>:<id>" the worker resolves for platform URLs (e.g.
  // "youtube:dQw4w9WgXcQ"). Used to reuse an existing transcript for a repeat
  // video. Null for uploads and unrecognized/generic URLs.
  sourceVideoId: text("source_video_id"),
  uploadKey: text("upload_key"),
  originalFilename: text("original_filename"),
  // Human-friendly title: upload filename or, for URLs, the video title the
  // worker captures. Used as the display title and download file name.
  outputName: text("output_name"),
  tier: text("tier").notNull(),
  creditsPerMinute: integer("credits_per_minute").notNull(),
  billing: text("billing").notNull().default("credits"), // credits | subscription
  subscriptionId: uuid("subscription_id"),
  // Subscription minutes and backup credits are reserved before an ASR call.
  // This prevents concurrent jobs from exceeding a plan allowance. A job may
  // use both when it crosses the end of an allowance period.
  subscriptionMinutesHeld: integer("subscription_minutes_held").notNull().default(0),
  subscriptionMinutesCharged: integer("subscription_minutes_charged").notNull().default(0),
  // Snapshot the allowance window that supplied the hold. A refund from a job
  // finishing after reset must not subtract usage from the new window.
  subscriptionAllowancePeriodEnd: timestamp("subscription_allowance_period_end", {
    withTimezone: true,
  }),
  batchId: uuid("batch_id"), // set for jobs that came from a playlist batch
  folderId: uuid("folder_id"), // optional: user-created folder this transcript is filed under
  diarize: boolean("diarize").notNull().default(false), // label speakers (Premium/Soniox)
  // Estimated API cost: rate snapshotted at submit, actual set at completion.
  costPerMinuteCents: doublePrecision("cost_per_minute_cents").notNull().default(0),
  estCostCents: doublePrecision("est_cost_cents").notNull().default(0),
  languageHint: text("language_hint"), // ISO-639-1 code, or null for auto-detect

  // pending -> probing -> downloading -> transcribing -> completed | failed
  status: text("status").notNull().default("pending"),
  durationSeconds: doublePrecision("duration_seconds"),
  creditsHeld: integer("credits_held").notNull().default(0),
  creditsCharged: integer("credits_charged").notNull().default(0),
  language: text("language"),
  error: text("error"),
  // Retained compressed audio for in-page playback (deleted after it expires).
  audioKey: text("audio_key"),
  audioExpiresAt: timestamp("audio_expires_at", { withTimezone: true }),
  // Set to a random token when the owner turns on public sharing; the transcript
  // is then readable at /share/<share_id> without signing in. Null = private.
  shareId: text("share_id").unique(),
  // URL jobs are safely probed by the isolated worker and shown to the user for
  // confirmation before any paid transcription request is made.
  requiresConfirmation: boolean("requires_confirmation").notNull().default(false),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  // Snapshot the route that actually produced the result. This remains truthful
  // if deployment defaults change later.
  provider: text("provider"),
  model: text("model"),
  resultSource: text("result_source"), // provider | same-account-cache
  // Point of no return for conservative spend accounting. Once a provider
  // request may have been accepted, a timeout/failure must not release the
  // projected API-cost reservation or automatically replay the paid request.
  providerStartedAt: timestamp("provider_started_at", { withTimezone: true }),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("jobs_status_created_idx").on(t.status, t.createdAt), // worker queue poll
  index("jobs_user_created_idx").on(t.userId, t.createdAt),
  index("jobs_video_reuse_idx").on(t.sourceVideoId, t.tier), // transcript reuse lookup
]);

// User-created folders for organizing transcripts. Each has a color tag shown
// as a dot in the dashboard. Deleting a folder un-files its jobs (folder_id set
// to null) rather than deleting them.
export const folders = pgTable(
  "folders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull().default("slate"), // a FolderColor key
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("folders_user_idx").on(t.userId, t.createdAt)],
);

export type Folder = typeof folders.$inferSelect;

export const transcripts = pgTable("transcripts", {
  jobId: uuid("job_id")
    .primaryKey()
    .references(() => jobs.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  segments: jsonb("segments").notNull().$type<TranscriptSegment[]>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// A small revision trail makes customer corrections reversible. A revision is
// written before each edit; the current text remains in `transcripts` so every
// export and public share uses the corrected version.
export const transcriptRevisions = pgTable(
  "transcript_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    segments: jsonb("segments").notNull().$type<TranscriptSegment[]>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("transcript_revisions_job_idx").on(t.jobId, t.createdAt)],
);

// Upload intents bind server-minted object keys to one account and an expiry.
// The worker deletes terminal sources and expired unclaimed objects.
export const uploads = pgTable(
  "uploads",
  {
    key: text("key").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    originalFilename: text("original_filename").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("uploads_expiry_idx").on(t.expiresAt, t.claimedAt)],
);

// Admin-editable settings. One row per top-level settings key; value is JSON.
// Read/merged over code defaults in web/src/lib/settings.ts.
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Active/past subscriptions. A user has at most one active row (enforced in app
// logic). Fair-use is metered by minutesUsed against allowanceMinutes. Annual
// plans are billed annually but their allowance resets monthly.
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    planId: text("plan_id").notNull(), // matches a SubscriptionPlan.id
    tier: text("tier").notNull(), // standard | premium
    interval: text("interval").notNull(), // month | year | week
    // active grants entitlement. Stripe lifecycle values such as past_due,
    // unpaid, or paused are retained but do not grant transcription minutes.
    status: text("status").notNull().default("active"),
    allowanceMinutes: integer("allowance_minutes").notNull(),
    minutesUsed: integer("minutes_used").notNull().default(0),
    // The allowance window. This is monthly for both monthly and annual plans,
    // and weekly for a one-time week pass; periodStart/End remain the billing
    // period used to decide whether the subscription is active.
    allowancePeriodStart: timestamp("allowance_period_start", { withTimezone: true })
      .notNull()
      .defaultNow(),
    allowancePeriodEnd: timestamp("allowance_period_end", { withTimezone: true }).notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull().defaultNow(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    stripeSubscriptionId: text("stripe_subscription_id").unique(),
    stripeCustomerId: text("stripe_customer_id"),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("subscriptions_user_idx").on(t.userId, t.status),
    uniqueIndex("subscriptions_one_active_user_idx")
      .on(t.userId)
      .where(sql`${t.status} = 'active'`),
  ],
);

export type Subscription = typeof subscriptions.$inferSelect;

// A playlist submission. The worker expands it (yt-dlp) into `items`, then the
// user confirms the total price, which creates one job per item (batch_id set).
export const jobBatches = pgTable(
  "job_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sourceUrl: text("source_url").notNull(),
    tier: text("tier").notNull(),
    creditsPerMinute: integer("credits_per_minute").notNull(),
    costPerMinuteCents: doublePrecision("cost_per_minute_cents").notNull().default(0),
    languageHint: text("language_hint"),
    diarize: boolean("diarize").notNull().default(false),
    // expanding -> ready -> started | failed
    status: text("status").notNull().default("expanding"),
    videoCount: integer("video_count").notNull().default(0),
    totalSeconds: doublePrecision("total_seconds").notNull().default(0),
    items: jsonb("items").notNull().$type<BatchItem[]>().default([]),
    error: text("error"),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("job_batches_status_idx").on(t.status, t.createdAt)],
);

export type BatchItem = { url: string; title: string; duration: number | null };
export type JobBatch = typeof jobBatches.$inferSelect;

export type TranscriptSegment = {
  start: number;
  end: number;
  text: string;
  speaker?: string;
};
export type User = typeof users.$inferSelect;
export type Job = typeof jobs.$inferSelect;
