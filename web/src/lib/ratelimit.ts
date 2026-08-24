import { createHash } from "node:crypto";
import { eq, lt, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "./db";
import { rateLimits } from "./schema";

export type RateResult = { ok: boolean; retryAfterSec: number };

function bucketId(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * An atomic fixed-window limiter shared by every web instance.
 *
 * The logical key is hashed before storage so email addresses and IPs do not
 * become readable operational data. PostgreSQL performs the increment in one
 * statement, avoiding race-prone read/then-write checks.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateResult> {
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowMs);
  const rows = await db.execute<{ count: number; reset_at: Date }>(sql`
    INSERT INTO rate_limits ("key", "count", "reset_at")
    VALUES (${bucketId(key)}, 1, ${resetAt})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE
        WHEN rate_limits."reset_at" <= ${now} THEN 1
        ELSE least(rate_limits."count" + 1, ${limit + 1})
      END,
      "reset_at" = CASE
        WHEN rate_limits."reset_at" <= ${now} THEN ${resetAt}
        ELSE rate_limits."reset_at"
      END
    RETURNING "count", "reset_at"
  `);
  const row = rows[0];
  // Opportunistic expiry keeps the shared table bounded without a separate
  // maintenance service. The reset-time index makes this deletion inexpensive.
  if (Math.random() < 0.01) {
    await db.delete(rateLimits).where(lt(rateLimits.resetAt, now));
  }
  const rowReset = row.reset_at instanceof Date ? row.reset_at : new Date(row.reset_at);
  return {
    ok: row.count <= limit,
    retryAfterSec: row.count <= limit
      ? 0
      : Math.max(1, Math.ceil((rowReset.getTime() - now.getTime()) / 1000)),
  };
}

/** Clear a successful user's bucket without exposing the logical key. */
export async function resetRateLimit(key: string): Promise<void> {
  await db.delete(rateLimits).where(eq(rateLimits.key, bucketId(key)));
}

/** Best-effort client address supplied by the trusted deployment proxy. */
export async function clientIp(): Promise<string> {
  const requestHeaders = await headers();
  const value =
    requestHeaders.get("cf-connecting-ip") ??
    requestHeaders.get("x-forwarded-for")?.split(",")[0] ??
    requestHeaders.get("x-real-ip") ??
    "unknown";
  return value.trim().slice(0, 128);
}
