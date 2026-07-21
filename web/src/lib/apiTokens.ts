import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "./db";
import { apiTokens, type ApiToken } from "./schema";

// Personal access tokens for the browser extension / API. The raw token is
// shown to the user exactly once (at creation); we persist only its sha256, so
// a DB leak can't be replayed. Bearer-authenticated in getRequestUser().

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export type PublicApiToken = Pick<ApiToken, "id" | "name" | "lastUsedAt" | "createdAt">;

const publicColumns = {
  id: apiTokens.id,
  name: apiTokens.name,
  lastUsedAt: apiTokens.lastUsedAt,
  createdAt: apiTokens.createdAt,
};

/** Create a token, returning the raw secret ONCE. Only its hash is stored. */
export async function createApiToken(
  userId: string,
  name: string,
): Promise<{ token: string; record: PublicApiToken }> {
  const token = `sk_${randomBytes(24).toString("base64url")}`;
  const [record] = await db
    .insert(apiTokens)
    .values({ userId, name: name.slice(0, 60) || "Extension", tokenHash: sha256(token) })
    .returning(publicColumns);
  return { token, record };
}

export async function listApiTokens(userId: string): Promise<PublicApiToken[]> {
  return db
    .select(publicColumns)
    .from(apiTokens)
    .where(eq(apiTokens.userId, userId))
    .orderBy(desc(apiTokens.createdAt));
}

/** Revoke one of the user's tokens. Scoped to the owner so IDs can't be guessed. */
export async function revokeApiToken(userId: string, id: string): Promise<void> {
  await db.delete(apiTokens).where(and(eq(apiTokens.id, id), eq(apiTokens.userId, userId)));
}
