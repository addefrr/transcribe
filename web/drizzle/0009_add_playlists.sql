CREATE TABLE "job_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source_url" text NOT NULL,
	"tier" text NOT NULL,
	"credits_per_minute" integer NOT NULL,
	"cost_per_minute_cents" double precision DEFAULT 0 NOT NULL,
	"language_hint" text,
	"diarize" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'expanding' NOT NULL,
	"video_count" integer DEFAULT 0 NOT NULL,
	"total_seconds" double precision DEFAULT 0 NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text,
	"claimed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "batch_id" uuid;--> statement-breakpoint
ALTER TABLE "job_batches" ADD CONSTRAINT "job_batches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_batches_status_idx" ON "job_batches" USING btree ("status","created_at");