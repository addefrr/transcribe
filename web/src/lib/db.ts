import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/transcribe";

// Reuse the pool across Next.js dev hot-reloads.
const globalForDb = globalThis as unknown as { pgSql?: ReturnType<typeof postgres> };

const sql = globalForDb.pgSql ?? postgres(DATABASE_URL, { max: 10 });
if (process.env.NODE_ENV !== "production") globalForDb.pgSql = sql;

export const db = drizzle(sql, { schema });
