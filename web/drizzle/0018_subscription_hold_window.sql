-- Tie each reserved plan-minute hold to the allowance window it came from so
-- a late completion/failure cannot refund minutes into a newer monthly window.
ALTER TABLE "jobs"
  ADD COLUMN "subscription_allowance_period_end" timestamp with time zone;
