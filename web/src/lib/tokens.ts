import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "./db";
import { authTokens } from "./schema";

export type TokenKind = "verify" | "reset";

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

// Issues a one-time token, storing only its hash. Returns the raw token to put
// in the emailed link.
export async function createAuthToken(
  userId: string,
  kind: TokenKind,
  ttlMs: number,
): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await db.insert(authTokens).values({
    userId,
    kind,
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + ttlMs),
  });
  return token;
}

// Validates a token and marks it used (single-use). Returns the userId on
// success, or null if the token is unknown, wrong-kind, expired, or already
// used.
export async function consumeAuthToken(token: string, kind: TokenKind): Promise<string | null> {
  if (!token || token.length < 16) return null;
  // Single atomic UPDATE: only an unused, unexpired token of the right kind is
  // marked used, and RETURNING yields the userId only if a row actually matched.
  // This closes the check-then-update race two concurrent requests could hit.
  const now = new Date();
  const [row] = await db
    .update(authTokens)
    .set({ usedAt: now })
    .where(
      and(
        eq(authTokens.tokenHash, sha256(token)),
        eq(authTokens.kind, kind),
        isNull(authTokens.usedAt),
        gt(authTokens.expiresAt, now),
      ),
    )
    .returning({ userId: authTokens.userId });
  return row?.userId ?? null;
}
