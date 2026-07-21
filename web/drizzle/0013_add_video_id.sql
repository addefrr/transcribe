ALTER TABLE "jobs" ADD COLUMN "source_video_id" text;--> statement-breakpoint
CREATE INDEX "jobs_video_reuse_idx" ON "jobs" USING btree ("source_video_id","tier") WHERE "source_video_id" IS NOT NULL;
