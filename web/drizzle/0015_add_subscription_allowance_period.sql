-- Billing cadence and usage cadence differ for annual plans: they pay yearly
-- but receive the same allowance as the monthly plan each calendar month.
ALTER TABLE "subscriptions"
  ADD COLUMN "allowance_period_start" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "subscriptions"
  ADD COLUMN "allowance_period_end" timestamp with time zone;
--> statement-breakpoint
-- Existing subscriptions start a fresh allowance window when this migration is
-- deployed. Week passes retain a weekly window; all recurring plans reset monthly.
UPDATE "subscriptions"
SET "allowance_period_end" = CASE
  WHEN "interval" = 'week' THEN now() + interval '7 days'
  ELSE now() + interval '1 month'
END;
--> statement-breakpoint
ALTER TABLE "subscriptions"
  ALTER COLUMN "allowance_period_end" SET NOT NULL;
