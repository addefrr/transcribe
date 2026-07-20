ALTER TABLE "jobs" ADD COLUMN "cost_per_minute_cents" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "est_cost_cents" double precision DEFAULT 0 NOT NULL;