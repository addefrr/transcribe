import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { jobs } from "@/lib/schema";
import { isTier } from "@/lib/pricing";
import { getSettings } from "@/lib/settings";
import { readObject } from "@/lib/storage";
import { isUuid } from "@/lib/uuid";

// Streams a job's retained audio (owner only) for the in-page player.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [job] = await db
    .select({ audioKey: jobs.audioKey, audioExpiresAt: jobs.audioExpiresAt, tier: jobs.tier })
    .from(jobs)
    .where(and(eq(jobs.id, id), eq(jobs.userId, user.id)))
    .limit(1);
  if (!job?.audioKey || (job.audioExpiresAt && job.audioExpiresAt < new Date())) {
    return NextResponse.json({ error: "Audio not available" }, { status: 404 });
  }
  const settings = await getSettings();
  const features = isTier(job.tier)
    ? settings.tierFeatures[job.tier]
    : settings.tierFeatures.standard;
  if (!features.audioPlayback) {
    return NextResponse.json({ error: "Audio playback is not included in this tier." }, { status: 403 });
  }

  const obj = await readObject(job.audioKey, req.headers.get("range"));
  if (!obj) return NextResponse.json({ error: "Audio not available" }, { status: 404 });
  if ("redirect" in obj) return NextResponse.redirect(obj.redirect, 302);
  if ("unsatisfiable" in obj) {
    return new NextResponse(null, {
      status: 416,
      headers: {
        "accept-ranges": "bytes",
        "content-range": `bytes */${obj.size}`,
        "cache-control": "private, no-store",
      },
    });
  }

  const contentLength = obj.range
    ? obj.range.end - obj.range.start + 1
    : obj.size;

  return new NextResponse(obj.stream, {
    status: obj.range ? 206 : 200,
    headers: {
      "content-type": "audio/ogg",
      "content-length": String(contentLength),
      "accept-ranges": "bytes",
      ...(obj.range
        ? { "content-range": `bytes ${obj.range.start}-${obj.range.end}/${obj.size}` }
        : {}),
      "cache-control": "private, max-age=3600",
    },
  });
}
