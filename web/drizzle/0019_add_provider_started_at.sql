-- Record the point immediately before a paid transcription request is sent.
-- This lets stale-job recovery avoid a duplicate provider charge and retain a
-- conservative spend reservation when the remote result is uncertain.
ALTER TABLE "jobs"
  ADD COLUMN "provider_started_at" timestamp with time zone;
--> statement-breakpoint
-- Completed provider results created before this marker existed represent a
-- paid request. Cache hits explicitly carry zero cost and stay unmarked.
UPDATE "jobs"
SET "provider_started_at" = "updated_at"
WHERE "status" = 'completed'
  AND "est_cost_cents" > 0
  AND coalesce("result_source", 'provider') = 'provider';
