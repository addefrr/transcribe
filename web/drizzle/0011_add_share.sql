ALTER TABLE "jobs" ADD COLUMN "share_id" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_share_id_unique" UNIQUE("share_id");
