import { sql } from "drizzle-orm";
import { db } from "./db";
import { getSettings } from "./settings";

export type Wallet = {
  revenueCents: number;
  spentCents: number; // estimated transcription API spend so far
  spendPct: number;
  budgetCents: number; // revenue × spendPct
  remainingCents: number; // budget − spent (can be negative)
  overBudget: boolean;
};

const num = (v: unknown) => Number(v ?? 0);

/**
 * The platform "wallet": all earnings fund one balance, and we cap transcription
 * API spend at `walletSpendPct`% of it. Revenue = credit purchases + subscription
 * payments; spend = estimated API cost of all jobs.
 */
export async function getWallet(): Promise<Wallet> {
  const { walletSpendPct } = await getSettings();
  const [row] = (await db.execute(sql`
    SELECT
      (SELECT coalesce(sum(amount_usd_cents), 0) FROM credit_ledger
         WHERE reason IN ('purchase', 'subscription')) AS revenue_cents,
      (SELECT coalesce(sum(est_cost_cents), 0) FROM jobs) AS spent_cents
  `)) as unknown as Record<string, unknown>[];

  const revenueCents = num(row.revenue_cents);
  const spentCents = num(row.spent_cents);
  const budgetCents = (revenueCents * walletSpendPct) / 100;
  return {
    revenueCents,
    spentCents,
    spendPct: walletSpendPct,
    budgetCents,
    remainingCents: budgetCents - spentCents,
    // Only trip once there's revenue to protect — otherwise free signup-bonus
    // usage (revenue 0, budget 0) would be blocked from the start.
    overBudget: revenueCents > 0 && spentCents >= budgetCents,
  };
}
