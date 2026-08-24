-- Reserve subscription usage before provider spend, support honest URL
-- confirmation, snapshot AI provenance, and make transcript edits reversible.
ALTER TABLE "jobs"
  ADD COLUMN "subscription_minutes_held" integer DEFAULT 0 NOT NULL,
  ADD COLUMN "subscription_minutes_charged" integer DEFAULT 0 NOT NULL,
  ADD COLUMN "requires_confirmation" boolean DEFAULT false NOT NULL,
  ADD COLUMN "confirmed_at" timestamp with time zone,
  ADD COLUMN "provider" text,
  ADD COLUMN "model" text,
  ADD COLUMN "result_source" text;
--> statement-breakpoint
ALTER TABLE "transcripts"
  ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
CREATE TABLE "transcript_revisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "job_id" uuid NOT NULL REFERENCES "jobs"("id") ON DELETE cascade,
  "text" text NOT NULL,
  "segments" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "transcript_revisions_job_idx"
  ON "transcript_revisions" USING btree ("job_id", "created_at");
--> statement-breakpoint
CREATE TABLE "uploads" (
  "key" text PRIMARY KEY NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "original_filename" text NOT NULL,
  "content_type" text NOT NULL,
  "size_bytes" bigint NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "claimed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "uploads_expiry_idx" ON "uploads" USING btree ("expires_at", "claimed_at");
--> statement-breakpoint
ALTER TABLE "subscriptions"
  ADD COLUMN "stripe_customer_id" text,
  ADD COLUMN "cancel_at_period_end" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
WITH ranked AS (
  SELECT "id", row_number() OVER (
    PARTITION BY "user_id" ORDER BY "created_at" DESC
  ) AS position
  FROM "subscriptions" WHERE "status" = 'active'
)
UPDATE "subscriptions" SET "status" = 'canceled'
WHERE "id" IN (SELECT "id" FROM ranked WHERE position > 1);
--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_one_active_user_idx"
  ON "subscriptions" USING btree ("user_id") WHERE "status" = 'active';
