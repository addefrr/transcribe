import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { jobs } from "@/lib/schema";
import { isTier } from "@/lib/pricing";
import { getSettings } from "@/lib/settings";
import { isUuid } from "@/lib/uuid";

// Turn on public sharing: assign a random token if the job doesn't already have
// one. Only completed transcripts can be shared. Idempotent — re-enabling keeps
// the existing link so previously copied URLs keep working.
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [job] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, id), eq(jobs.userId, user.id)))
    .limit(1);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (job.status !== "completed") {
    return NextResponse.json({ error: "Only finished transcripts can be shared" }, { status: 400 });
  }
  const settings = await getSettings();
  const features = isTier(job.tier)
    ? settings.tierFeatures[job.tier]
    : settings.tierFeatures.standard;
  if (!features.publicSharing) {
    return NextResponse.json(
      { error: "Public sharing is not included in this tier." },
      { status: 403 },
    );
  }

  let shareId = job.shareId;
  if (!shareId) {
    shareId = randomBytes(16).toString("base64url");
    await db
      .update(jobs)
      .set({ shareId })
      .where(and(eq(jobs.id, id), eq(jobs.userId, user.id)));
  }
  return NextResponse.json({ shareId });
}

// Turn off public sharing. The old link stops working immediately.
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [job] = await db
    .update(jobs)
    .set({ shareId: null })
    .where(and(eq(jobs.id, id), eq(jobs.userId, user.id)))
    .returning();
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
