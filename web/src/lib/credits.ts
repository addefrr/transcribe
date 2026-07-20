import { eq, sql } from "drizzle-orm";
import { db } from "./db";
import { creditLedger, users } from "./schema";

type GrantOpts = { jobId?: string; stripeEventId?: string; amountUsdCents?: number };

/**
 * Atomically append a ledger row and move the balance.
 * When `stripeEventId` is set the grant is idempotent: replaying the same
 * Stripe event is a no-op. Returns false if skipped as a duplicate.
 * `amountUsdCents` records what the user actually paid (purchases only).
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
