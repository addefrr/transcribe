import { createHash, randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
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
  const [row] = await db
    .select()
    .from(authTokens)
    .where(and(eq(authTokens.tokenHash, sha256(token)), eq(authTokens.kind, kind)))
    .limit(1);
  if (!row || row.usedAt || row.expiresAt < new Date()) return null;
  await db.update(authTokens).set({ usedAt: new Date() }).where(eq(authTokens.id, row.id));
  return row.userId;
}
