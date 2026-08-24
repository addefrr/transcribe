import { sql } from "drizzle-orm";
import { db } from "./db";

// --- Access control -----------------------------------------------------------
// The developer portal is gated by a verified email allowlist. Requiring the
// verification proof is essential: otherwise somebody could register an
// allowlisted address before its owner and immediately obtain admin access.
export function isAdmin(
  user: { email: string; emailVerified: boolean } | null | undefined,
): boolean {
  if (!user?.emailVerified) return false;
  const allow = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return allow.includes(user.email.toLowerCase());
}

// --- Cost model (all configurable; contribution figures are estimates) --------
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
      (SELECT count(DISTINCT user_id) FROM credit_ledger
         WHERE reason IN ('purchase', 'subscription')) AS paying_users,
      ((SELECT coalesce(sum(amount_usd_cents), 0) FROM credit_ledger WHERE reason IN ('purchase', 'subscription'))
       + (SELECT coalesce(sum(value), 0) FROM platform_metrics
          WHERE "key" IN ('credit_revenue_cents', 'subscription_revenue_cents'))) AS revenue_cents,
      ((SELECT count(*) FROM credit_ledger
          WHERE reason IN ('purchase', 'subscription') AND amount_usd_cents IS NOT NULL)
       + (SELECT coalesce(sum(value), 0) FROM platform_metrics
          WHERE "key" IN ('credit_payment_count', 'subscription_payment_count'))) AS payment_count,
      ((SELECT coalesce(sum(amount_usd_cents), 0) FROM credit_ledger
          WHERE reason = 'purchase')
       + coalesce((SELECT value FROM platform_metrics
          WHERE "key" = 'credit_revenue_cents'), 0)) AS credit_revenue_cents,
      ((SELECT count(*) FROM credit_ledger
          WHERE reason = 'purchase' AND amount_usd_cents IS NOT NULL)
       + coalesce((SELECT value FROM platform_metrics
          WHERE "key" = 'credit_payment_count'), 0)) AS credit_payment_count,
      ((SELECT coalesce(sum(delta), 0) FROM credit_ledger WHERE reason = 'purchase')
       + coalesce((SELECT value FROM platform_metrics
          WHERE "key" = 'credits_sold'), 0)) AS credits_sold,
      ((SELECT coalesce(sum(delta), 0) FROM credit_ledger WHERE reason = 'signup_bonus')
       + coalesce((SELECT value FROM platform_metrics
          WHERE "key" = 'bonus_credits'), 0)) AS bonus_credits,
      ((SELECT coalesce(sum(credits_charged), 0) FROM jobs)
       + coalesce((SELECT value FROM platform_metrics
          WHERE "key" = 'credits_spent'), 0)) AS credits_spent,
      ((SELECT coalesce(sum(est_cost_cents), 0) FROM jobs)
       + coalesce((SELECT value FROM platform_metrics
          WHERE "key" = 'provider_spend_cents'), 0)) AS transcription_cost_cents,
      ((SELECT count(*) FROM jobs WHERE status = 'completed')
       + coalesce((SELECT value FROM platform_metrics
          WHERE "key" = 'jobs_completed'), 0)) AS jobs_completed,
      ((SELECT count(*) FROM jobs WHERE status = 'failed')
       + coalesce((SELECT value FROM platform_metrics
          WHERE "key" = 'jobs_failed'), 0)) AS jobs_failed,
      ((SELECT coalesce(sum(duration_seconds), 0) FROM jobs WHERE status = 'completed')
       + coalesce((SELECT value FROM platform_metrics
          WHERE "key" = 'audio_seconds'), 0)) AS audio_seconds
  `)) as unknown as Record<string, unknown>[];

  const customers = (await db.execute(sql`
    SELECT u.email, u.created_at, u.credit_balance,
           coalesce(sum(l.amount_usd_cents) FILTER (
             WHERE l.reason IN ('purchase', 'subscription')
           ), 0) AS spent_cents,
           coalesce(sum(l.delta) FILTER (WHERE l.reason = 'purchase'), 0) AS credits_bought
    FROM users u
    LEFT JOIN credit_ledger l ON l.user_id = u.id
    GROUP BY u.id, u.email, u.created_at, u.credit_balance
    ORDER BY spent_cents DESC, u.created_at DESC
    LIMIT 25
  `)) as unknown as Record<string, unknown>[];

  const revenueCents = num(totals.revenue_cents);
  const paymentCount = num(totals.payment_count);
  const creditRevenueCents = num(totals.credit_revenue_cents);
  const creditPaymentCount = num(totals.credit_payment_count);
  const creditsSold = num(totals.credits_sold);
  const creditsSpent = num(totals.credits_spent);

  // Estimated direct costs. Provider spend comes from each job's snapshotted
  // rate, so subscription work (which consumes no credits) is included too.
  const stripeFeesCents = paymentCount * STRIPE_FEE_FIXED_CENTS + revenueCents * STRIPE_FEE_PCT;
  const transcriptionCostCents = num(totals.transcription_cost_cents);
  const contributionCents = revenueCents - stripeFeesCents - transcriptionCostCents;

  // Unit economics per credit SOLD (assume a sold credit will eventually be
  // spent, so it carries one credit's worth of compute cost).
  const creditStripeFeesCents =
    creditPaymentCount * STRIPE_FEE_FIXED_CENTS + creditRevenueCents * STRIPE_FEE_PCT;
  const pricePerCredit = creditsSold ? creditRevenueCents / creditsSold : 0;
  const feePerCredit = creditsSold ? creditStripeFeesCents / creditsSold : 0;
  const contributionPerCredit = creditsSold
    ? pricePerCredit - feePerCredit - COST_PER_CREDIT_CENTS
    : 0;
  const contributionMarginPct = revenueCents
    ? (contributionCents / revenueCents) * 100
    : 0;

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
    paymentCount,
    revenueCents,
    stripeFeesCents,
    transcriptionCostCents,
    contributionCents,
    contributionMarginPct,
    // per-credit economics, all in cents
    pricePerCredit,
    feePerCredit,
    costPerCredit: COST_PER_CREDIT_CENTS,
    contributionPerCredit,
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
