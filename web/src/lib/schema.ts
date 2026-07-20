import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  creditBalance: integer("credit_balance").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// id is the sha256 of the cookie token, so a leaked DB dump can't be replayed.
export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
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
  amountUsdCents: integer("amount_usd_cents"), // set on purchases: what the user actually paid
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
  uploadKey: text("upload_key"),
  originalFilename: text("original_filename"),
  // Human-friendly title: upload filename or, for URLs, the video title the
  // worker captures. Used as the display title and download file name.
  outputName: text("output_name"),
  tier: text("tier").notNull(),
  creditsPerMinute: integer("credits_per_minute").notNull(),
  billing: text("billing").notNull().default("credits"), // credits | subscription
  subscriptionId: uuid("subscription_id"),
  diarize: boolean("diarize").notNull().default(false), // label speakers (Premium/AssemblyAI)
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
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("jobs_status_created_idx").on(t.status, t.createdAt), // worker queue poll
  index("jobs_user_created_idx").on(t.userId, t.createdAt),
]);

export const transcripts = pgTable("transcripts", {
  jobId: uuid("job_id")
    .primaryKey()
    .references(() => jobs.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  segments: jsonb("segments").notNull().$type<TranscriptSegment[]>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Admin-editable settings. One row per top-level settings key; value is JSON.
// Read/merged over code defaults in web/src/lib/settings.ts.
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Active/past subscriptions. A user has at most one active row (enforced in app
// logic). Fair-use is metered by minutesUsed against allowanceMinutes per period.
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
    status: text("status").notNull().default("active"), // active | canceled | expired
    allowanceMinutes: integer("allowance_minutes").notNull(),
    minutesUsed: integer("minutes_used").notNull().default(0),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull().defaultNow(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    stripeSubscriptionId: text("stripe_subscription_id").unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("subscriptions_user_idx").on(t.userId, t.status)],
);

export type Subscription = typeof subscriptions.$inferSelect;

export type TranscriptSegment = {
  start: number;
  end: number;
  text: string;
  speaker?: string;
};
export type User = typeof users.$inferSelect;
export type Job = typeof jobs.$inferSelect;
