import { headers } from "next/headers";

// In-memory fixed-window rate limiter. Sufficient for a single long-running
// Node server (this app's deployment model); swap for Redis if you run multiple
// instances. State lives in module scope so it persists across requests.

type Window = { count: number; resetAt: number };
const buckets = new Map<string, Window>();

export type RateResult = { ok: boolean; retryAfterSec: number };

export function rateLimit(key: string, limit: number, windowMs: number): RateResult {
  const now = Date.now();

  // Opportunistic prune so the map doesn't grow without bound.
  if (buckets.size > 5000 && Math.random() < 0.02) {
    for (const [k, w] of buckets) if (w.resetAt <= now) buckets.delete(k);
  }

  const w = buckets.get(key);
  if (!w || w.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }
  if (w.count >= limit) {
    return { ok: false, retryAfterSec: Math.ceil((w.resetAt - now) / 1000) };
  }
  w.count += 1;
  return { ok: true, retryAfterSec: 0 };
}

// Best-effort client IP from proxy headers; falls back to a shared bucket.
export async function clientIp(): Promise<string> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return h.get("x-real-ip") ?? "unknown";
}
