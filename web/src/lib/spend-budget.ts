import { sql } from "drizzle-orm";
import { db } from "./db";

// This pair is an application-wide namespace for the provider-spend budget.
// The Python worker uses the same values. Every new/increased reservation must
// hold this transaction-scoped lock until its jobs.est_cost_cents write commits.
const SPEND_LOCK_NAMESPACE = 8_367_441;
const SPEND_LOCK_KEY = 1;

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type SpendReservation = {
  revenueCents: number;
  committedCents: number;
  projectedCommittedCents: number;
  budgetCents: number;
};

const numeric = (value: unknown): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Serialize and validate a replacement provider-spend reservation.
 *
 * `committedCents` is the amount this transaction is replacing (normally zero
 * for a new job). The caller must write `projectedCents` to jobs.est_cost_cents
 * in the same transaction. The advisory lock then remains held until commit,
 * so another confirmation cannot inspect the old total in between the check
 * and the write.
 */
export async function assertProviderSpendReservation(
  tx: DbTransaction,
  projectedCents: number,
  committedCents: number,
  fallbackSpendPct: number,
): Promise<SpendReservation> {
  const projected = Math.max(0, numeric(projectedCents));
  const replacing = Math.max(0, numeric(committedCents));
  const fallbackPct = Math.min(100, Math.max(1, numeric(fallbackSpendPct)));

  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(${SPEND_LOCK_NAMESPACE}, ${SPEND_LOCK_KEY})`,
  );
  const [row] = (await tx.execute(sql`
    SELECT
      ((SELECT coalesce(sum(amount_usd_cents), 0) FROM credit_ledger
          WHERE reason IN ('purchase', 'subscription'))
       + (SELECT coalesce(sum(value), 0) FROM platform_metrics
          WHERE "key" IN ('credit_revenue_cents', 'subscription_revenue_cents')))
        AS revenue_cents,
      ((SELECT coalesce(sum(est_cost_cents), 0) FROM jobs)
       + coalesce((SELECT value FROM platform_metrics
          WHERE "key" = 'provider_spend_cents'), 0)) AS committed_cents,
      least(100, greatest(1, coalesce(
        (SELECT CASE
           WHEN jsonb_typeof(value) = 'number' THEN (value #>> '{}')::double precision
           ELSE NULL
         END
         FROM settings
         WHERE key = 'walletSpendPct'),
        ${fallbackPct}
      ))) AS spend_pct
  `)) as unknown as Record<string, unknown>[];

  const revenueCents = numeric(row?.revenue_cents);
  const committedTotal = numeric(row?.committed_cents);
  const spendPct = numeric(row?.spend_pct);
  const budgetCents = (revenueCents * spendPct) / 100;
  const projectedCommittedCents = Math.max(0, committedTotal - replacing + projected);

  // Preserve the existing free-trial behavior when no payments have been
  // recorded. Once revenue exists, even fractional-cent reservations count.
  if (revenueCents > 0 && projectedCommittedCents > budgetCents + 1e-9) {
    throw new ProviderSpendCapacityError({
      revenueCents,
      committedCents: committedTotal,
      projectedCommittedCents,
      budgetCents,
    });
  }

  return {
    revenueCents,
    committedCents: committedTotal,
    projectedCommittedCents,
    budgetCents,
  };
}

export class ProviderSpendCapacityError extends Error {
  constructor(readonly reservation: SpendReservation) {
    super("The projected transcription provider spend exceeds the configured budget.");
  }
}
