-- Anonymous additive counters preserve lifetime financial/usage totals when
-- customer-linked jobs and ledgers are removed through self-service deletion.
CREATE TABLE "platform_metrics" (
  "key" text PRIMARY KEY NOT NULL,
  "value" double precision DEFAULT 0 NOT NULL
);
