import { and, eq, sql } from "drizzle-orm";
import { db } from "./db";
import { creditLedger, users } from "./schema";

type GrantOpts = { jobId?: string; stripeEventId?: string; amountUsdCents?: number };

/**
 * Atomically append a ledger row and move the balance.
 * When `stripeEventId` is set the grant is idempotent: replaying the same
 * Stripe event is a no-op. Returns false if skipped as a duplicate.
 * `amountUsdCents` records the tax-exclusive payment value supplied by the
 * caller. It is operational data, not a substitute for Stripe accounting.
 */
export async function grantCredits(
  userId: string,
  delta: number,
  reason: "signup_bonus" | "purchase" | "refund" | "subscription",
  opts: GrantOpts = {},
): Promise<boolean> {
  return db.transaction(async (tx) => {
    if (opts.stripeEventId) {
      const inserted = await tx
        .insert(creditLedger)
        .values({
          userId,
          delta,
          reason,
          stripeEventId: opts.stripeEventId,
          amountUsdCents: opts.amountUsdCents,
        })
        .onConflictDoNothing({ target: creditLedger.stripeEventId })
        .returning({ id: creditLedger.id });
      if (inserted.length === 0) return false;
    } else {
      await tx.insert(creditLedger).values({
        userId,
        delta,
        reason,
        jobId: opts.jobId,
        amountUsdCents: opts.amountUsdCents,
      });
    }
    await tx
      .update(users)
      .set({ creditBalance: sql`${users.creditBalance} + ${delta}` })
      .where(eq(users.id, userId));
    return true;
  });
}

/**
 * Mark an account verified and grant its one-time signup bonus atomically.
 * The conditional update is the idempotency guard: only the first successful
 * verification can receive the bonus, even if a user has multiple email links.
 */
export async function verifyEmailAndGrantSignupBonus(
  userId: string,
  signupBonusCredits: number,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const verified = await tx
      .update(users)
      .set({ emailVerified: true })
      .where(and(eq(users.id, userId), eq(users.emailVerified, false)))
      .returning({ id: users.id });
    if (verified.length === 0) return false;

    if (signupBonusCredits > 0) {
      await tx.insert(creditLedger).values({
        userId,
        delta: signupBonusCredits,
        reason: "signup_bonus",
      });
      await tx
        .update(users)
        .set({ creditBalance: sql`${users.creditBalance} + ${signupBonusCredits}` })
        .where(eq(users.id, userId));
    }
    return true;
  });
}
