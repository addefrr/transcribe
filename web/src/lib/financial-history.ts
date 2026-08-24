import { sql } from "drizzle-orm";
import { db } from "./db";
import type { Job } from "./schema";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const METRIC = {
  creditRevenueCents: "credit_revenue_cents",
  subscriptionRevenueCents: "subscription_revenue_cents",
  creditPaymentCount: "credit_payment_count",
  subscriptionPaymentCount: "subscription_payment_count",
  creditsSold: "credits_sold",
  bonusCredits: "bonus_credits",
  creditsSpent: "credits_spent",
  providerSpendCents: "provider_spend_cents",
  jobsCompleted: "jobs_completed",
  jobsFailed: "jobs_failed",
  audioSeconds: "audio_seconds",
} as const;

function number(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function incrementMetrics(
  tx: DbTransaction,
  values: Record<string, number>,
): Promise<void> {
  for (const [key, rawValue] of Object.entries(values)) {
    const value = number(rawValue);
    if (value === 0) continue;
    await tx.execute(sql`
      INSERT INTO platform_metrics ("key", "value")
      VALUES (${key}, ${value})
      ON CONFLICT ("key") DO UPDATE
      SET "value" = platform_metrics."value" + excluded."value"
    `);
  }
}

/** Preserve only anonymous additive history before one customer job is removed. */
export async function rollUpJobHistory(
  tx: DbTransaction,
  job: Pick<Job, "status" | "creditsCharged" | "estCostCents" | "durationSeconds">,
): Promise<void> {
  await incrementMetrics(tx, {
    [METRIC.creditsSpent]: Math.max(0, number(job.creditsCharged)),
    [METRIC.providerSpendCents]: Math.max(0, number(job.estCostCents)),
    [METRIC.jobsCompleted]: job.status === "completed" ? 1 : 0,
    [METRIC.jobsFailed]: job.status === "failed" ? 1 : 0,
    [METRIC.audioSeconds]:
      job.status === "completed" ? Math.max(0, number(job.durationSeconds)) : 0,
  });
}

/**
 * Preserve anonymous lifetime totals before all customer-linked ledger/jobs
 * cascade away. No account, job, source, payment, or provider identifier is
 * copied into platform_metrics.
 */
export async function rollUpAccountHistory(
  tx: DbTransaction,
  userId: string,
): Promise<void> {
  const [row] = (await tx.execute(sql`
    SELECT
      (SELECT coalesce(sum(amount_usd_cents), 0) FROM credit_ledger
        WHERE user_id = ${userId} AND reason = 'purchase') AS credit_revenue_cents,
      (SELECT coalesce(sum(amount_usd_cents), 0) FROM credit_ledger
        WHERE user_id = ${userId} AND reason = 'subscription') AS subscription_revenue_cents,
      (SELECT count(*) FROM credit_ledger
        WHERE user_id = ${userId} AND reason = 'purchase'
          AND amount_usd_cents IS NOT NULL) AS credit_payment_count,
      (SELECT count(*) FROM credit_ledger
        WHERE user_id = ${userId} AND reason = 'subscription'
          AND amount_usd_cents IS NOT NULL) AS subscription_payment_count,
      (SELECT coalesce(sum(delta), 0) FROM credit_ledger
        WHERE user_id = ${userId} AND reason = 'purchase') AS credits_sold,
      (SELECT coalesce(sum(delta), 0) FROM credit_ledger
        WHERE user_id = ${userId} AND reason = 'signup_bonus') AS bonus_credits,
      (SELECT coalesce(sum(credits_charged), 0) FROM jobs
        WHERE user_id = ${userId}) AS credits_spent,
      (SELECT coalesce(sum(CASE WHEN provider_started_at IS NOT NULL
          THEN est_cost_cents ELSE 0 END), 0) FROM jobs
        WHERE user_id = ${userId}) AS provider_spend_cents,
      (SELECT count(*) FROM jobs
        WHERE user_id = ${userId} AND status = 'completed') AS jobs_completed,
      (SELECT count(*) FROM jobs
        WHERE user_id = ${userId} AND status = 'failed') AS jobs_failed,
      (SELECT coalesce(sum(duration_seconds), 0) FROM jobs
        WHERE user_id = ${userId} AND status = 'completed') AS audio_seconds
  `)) as unknown as Record<string, unknown>[];

  await incrementMetrics(tx, {
    [METRIC.creditRevenueCents]: number(row?.credit_revenue_cents),
    [METRIC.subscriptionRevenueCents]: number(row?.subscription_revenue_cents),
    [METRIC.creditPaymentCount]: number(row?.credit_payment_count),
    [METRIC.subscriptionPaymentCount]: number(row?.subscription_payment_count),
    [METRIC.creditsSold]: number(row?.credits_sold),
    [METRIC.bonusCredits]: number(row?.bonus_credits),
    [METRIC.creditsSpent]: number(row?.credits_spent),
    [METRIC.providerSpendCents]: number(row?.provider_spend_cents),
    [METRIC.jobsCompleted]: number(row?.jobs_completed),
    [METRIC.jobsFailed]: number(row?.jobs_failed),
    [METRIC.audioSeconds]: number(row?.audio_seconds),
  });
}
