import { sql } from "drizzle-orm";
import { db } from "./db";

// --- Access control -----------------------------------------------------------
// The developer portal is gated by an email allowlist (ADMIN_EMAILS, comma-sep).
export function isAdmin(user: { email: string } | null | undefined): boolean {
  if (!user) return false;
  const allow = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return allow.includes(user.email.toLowerCase());
}

// --- Cost model (all configurable; profit figures are estimates) --------------
const STRIPE_FEE_PCT = Number(process.env.STRIPE_FEE_PCT ?? "2.9") / 100;
const STRIPE_FEE_FIXED_CENTS = Number(process.env.STRIPE_FEE_FIXED_CENTS ?? "30");
// Estimated transcription cost per credit spent, in cents. 1 credit ≈ 1 min of
// Standard audio; on managed APIs that's a fraction of a cent, so 0.1 is a
// deliberately conservative default. Tune to your real provider bills.
const COST_PER_CREDIT_CENTS = Number(process.env.EST_COST_PER_CREDIT_CENTS ?? "0.1");

const num = (v: unknown) => Number(v ?? 0);

export type AdminStats = Awaited<ReturnType<typeof getAdminStats>>;

export async function getAdminStats() {
  const [totals] = (await db.execute(sql`
    SELECT
      (SELECT count(*) FROM users) AS total_users,
      (SELECT coalesce(sum(credit_balance), 0) FROM users) AS credits_outstanding,
      (SELECT count(DISTINCT user_id) FROM credit_ledger WHERE reason = 'purchase') AS paying_users,
      (SELECT coalesce(sum(amount_usd_cents), 0) FROM credit_ledger WHERE reason IN ('purchase', 'subscription')) AS revenue_cents,
      (SELECT count(*) FROM credit_ledger WHERE reason = 'purchase') AS purchase_count,
      (SELECT coalesce(sum(delta), 0) FROM credit_ledger WHERE reason = 'purchase') AS credits_sold,
      (SELECT coalesce(sum(delta), 0) FROM credit_ledger WHERE reason = 'signup_bonus') AS bonus_credits,
      (SELECT coalesce(sum(credits_charged), 0) FROM jobs) AS credits_spent,
      (SELECT count(*) FROM jobs WHERE status = 'completed') AS jobs_completed,
      (SELECT count(*) FROM jobs WHERE status = 'failed') AS jobs_failed,
      (SELECT coalesce(sum(duration_seconds), 0) FROM jobs WHERE status = 'completed') AS audio_seconds
  `)) as unknown as Record<string, unknown>[];

  const customers = (await db.execute(sql`
    SELECT u.email, u.created_at, u.credit_balance,
           coalesce(sum(l.amount_usd_cents) FILTER (WHERE l.reason = 'purchase'), 0) AS spent_cents,
           coalesce(sum(l.delta) FILTER (WHERE l.reason = 'purchase'), 0) AS credits_bought
    FROM users u
    LEFT JOIN credit_ledger l ON l.user_id = u.id
    GROUP BY u.id, u.email, u.created_at, u.credit_balance
    ORDER BY spent_cents DESC, u.created_at DESC
    LIMIT 25
  `)) as unknown as Record<string, unknown>[];

  const revenueCents = num(totals.revenue_cents);
  const purchaseCount = num(totals.purchase_count);
  const creditsSold = num(totals.credits_sold);
  const creditsSpent = num(totals.credits_spent);

  // Estimated costs.
  const stripeFeesCents = purchaseCount * STRIPE_FEE_FIXED_CENTS + revenueCents * STRIPE_FEE_PCT;
  const computeCostCents = creditsSpent * COST_PER_CREDIT_CENTS;
  const profitCents = revenueCents - stripeFeesCents - computeCostCents;

  // Unit economics per credit SOLD (assume a sold credit will eventually be
  // spent, so it carries one credit's worth of compute cost).
  const pricePerCredit = creditsSold ? revenueCents / creditsSold : 0;
  const feePerCredit = creditsSold ? stripeFeesCents / creditsSold : 0;
  const profitPerCredit = creditsSold ? pricePerCredit - feePerCredit - COST_PER_CREDIT_CENTS : 0;
  const marginPct = revenueCents ? (profitCents / revenueCents) * 100 : 0;

  return {
    totalUsers: num(totals.total_users),
    payingUsers: num(totals.paying_users),
    creditsOutstanding: num(totals.credits_outstanding),
    creditsSold,
    bonusCredits: num(totals.bonus_credits),
    creditsSpent,
    jobsCompleted: num(totals.jobs_completed),
    jobsFailed: num(totals.jobs_failed),
    audioSeconds: num(totals.audio_seconds),
    purchaseCount,
    revenueCents,
    stripeFeesCents,
    computeCostCents,
    profitCents,
    marginPct,
    // per-credit economics, all in cents
    pricePerCredit,
    feePerCredit,
    costPerCredit: COST_PER_CREDIT_CENTS,
    profitPerCredit,
    customers: customers.map((c) => ({
      email: String(c.email),
      createdAt: new Date(c.created_at as string),
      creditBalance: num(c.credit_balance),
      spentCents: num(c.spent_cents),
      creditsBought: num(c.credits_bought),
    })),
    assumptions: {
      stripeFeePct: STRIPE_FEE_PCT * 100,
      stripeFeeFixedCents: STRIPE_FEE_FIXED_CENTS,
      costPerCreditCents: COST_PER_CREDIT_CENTS,
    },
  };
}
