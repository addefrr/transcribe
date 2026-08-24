-- The application retains the latest 20 undo points per transcript. Apply the
-- same bound to any revisions created before that limit was introduced.
WITH ranked AS (
  SELECT "id", row_number() OVER (
    PARTITION BY "job_id" ORDER BY "created_at" DESC, "id" DESC
  ) AS position
  FROM "transcript_revisions"
)
DELETE FROM "transcript_revisions"
USING ranked
WHERE "transcript_revisions"."id" = ranked."id"
  AND ranked.position > 20;
