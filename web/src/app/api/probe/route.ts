import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { and, eq, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isTier } from "@/lib/pricing";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { jobs, transcripts } from "@/lib/schema";
import { screenUrl } from "@/lib/ssrf";

const run = promisify(execFile);
const YTDLP_BIN = process.env.YTDLP_BIN || "yt-dlp";

type Probe = { durationSeconds: number | null; title: string | null; videoId: string | null };

// url -> probed length/title, briefly, so we don't re-spawn yt-dlp on every
// keystroke or tier toggle (the probe itself doesn't depend on tier/language;
// the reuse "cached" flag is recomputed each request). Bounded so distinct URLs
// can't grow the map without limit.
const cache = new Map<string, { at: number; probe: Probe }>();
const CACHE_TTL = 60_000;
const CACHE_MAX = 500;

async function probeUrl(url: string): Promise<Probe> {
  try {
    const { stdout } = await run(
      YTDLP_BIN,
      ["--dump-single-json", "--skip-download", "--no-playlist", "--socket-timeout", "20", url],
      { timeout: 25_000, maxBuffer: 32 * 1024 * 1024 },
    );
    const info = JSON.parse(stdout);
    const duration = typeof info.duration === "number" ? info.duration : null;
    const extractor = String(info.extractor_key || info.extractor || "").toLowerCase();
    const id = info.id ? String(info.id) : null;
    const videoId = id && extractor && extractor !== "generic" ? `${extractor}:${id}` : null;
    return { durationSeconds: duration, title: info.title ?? null, videoId };
  } catch {
    // yt-dlp missing, network error, unsupported URL — degrade gracefully so the
    // form falls back to "we'll work it out once we fetch it".
    return { durationSeconds: null, title: null, videoId: null };
  }
}

async function hasReusable(
  videoId: string,
  tier: string,
  diarize: boolean,
  language: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .innerJoin(transcripts, eq(transcripts.jobId, jobs.id))
    .where(
      and(
        eq(jobs.sourceVideoId, videoId),
        eq(jobs.tier, tier),
        eq(jobs.diarize, diarize),
        eq(jobs.status, "completed"),
        language ? eq(jobs.languageHint, language) : isNull(jobs.languageHint),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!rateLimit(`probe:ip:${await clientIp()}`, 60, 60_000).ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const url = (req.nextUrl.searchParams.get("url") ?? "").trim();
  const tierParam = req.nextUrl.searchParams.get("tier") ?? "standard";
  const tier = isTier(tierParam) ? tierParam : "standard";
  const diarize = req.nextUrl.searchParams.get("diarize") === "true";
  const language = req.nextUrl.searchParams.get("language") ?? "";
  if (!url || screenUrl(url)) {
    return NextResponse.json({ durationSeconds: null, title: null, cached: false });
  }

  const key = url;
  const hit = cache.get(key);
  const probe = hit && Date.now() - hit.at < CACHE_TTL ? hit.probe : await probeUrl(url);
  if (!hit || Date.now() - hit.at >= CACHE_TTL) {
    if (cache.size >= CACHE_MAX) cache.clear();
    cache.set(key, { at: Date.now(), probe });
  }

  // Speaker labels force Premium, matching the submit path — so the reuse cache
  // key uses the effective tier.
  const effectiveTier = diarize ? "premium" : tier;
  const cached = probe.videoId
    ? await hasReusable(probe.videoId, effectiveTier, diarize, language)
    : false;

  return NextResponse.json({
    durationSeconds: probe.durationSeconds,
    title: probe.title,
    cached,
  });
}
