import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { jobs } from "@/lib/schema";
import { readObject } from "@/lib/storage";
import { isUuid } from "@/lib/uuid";

// Streams a job's retained audio (owner only) for the in-page player.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [job] = await db
    .select({ audioKey: jobs.audioKey, audioExpiresAt: jobs.audioExpiresAt })
    .from(jobs)
    .where(and(eq(jobs.id, id), eq(jobs.userId, user.id)))
    .limit(1);
  if (!job?.audioKey || (job.audioExpiresAt && job.audioExpiresAt < new Date())) {
    return NextResponse.json({ error: "Audio not available" }, { status: 404 });
  }

  const obj = await readObject(job.audioKey);
  if (!obj) return NextResponse.json({ error: "Audio not available" }, { status: 404 });
  if ("redirect" in obj) return NextResponse.redirect(obj.redirect, 302);

  return new NextResponse(obj.stream, {
    headers: {
      "content-type": "audio/ogg",
      "cache-control": "private, max-age=3600",
    },
  });
}
