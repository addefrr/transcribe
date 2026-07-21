import { hash, verify } from "@node-rs/argon2";
import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "./db";
import { apiTokens, sessions, users, type User } from "./schema";

const SESSION_COOKIE = "session";
const SESSION_DAYS = 30;

// OWASP-recommended argon2id parameters.
const ARGON2_OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTS);
}

export function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  return verify(passwordHash, password);
}

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000);
  await db.insert(sessions).values({ id: sha256(token), userId, expiresAt });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function getCurrentUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const rows = await db
    .select({ user: users, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, sha256(token)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.expiresAt < new Date()) {
    await db.delete(sessions).where(eq(sessions.id, sha256(token)));
    return null;
  }
  return row.user;
}

// Resolve the user for an API request. A "Bearer sk_…" header authenticates via
// a personal access token (used by the browser extension and API clients);
// otherwise we fall back to the session cookie. Used by the /api routes the
// extension calls so both cookie and token auth work through one code path.
export async function getRequestUser(req: Request): Promise<User | null> {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice(7).trim();
    if (!token) return null;
    const rows = await db
      .select({ user: users, tokenId: apiTokens.id })
      .from(apiTokens)
      .innerJoin(users, eq(users.id, apiTokens.userId))
      .where(eq(apiTokens.tokenHash, sha256(token)))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    // Best-effort "last used" stamp; never block the request on it.
    db.update(apiTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiTokens.id, row.tokenId))
      .catch(() => {});
    return row.user;
  }
  return getCurrentUser();
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.delete(sessions).where(eq(sessions.id, sha256(token)));
  }
  store.delete(SESSION_COOKIE);
}
