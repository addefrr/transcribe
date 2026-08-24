import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, getRequestUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { folders, jobs, transcripts } from "@/lib/schema";
import { isTier } from "@/lib/pricing";
import { customerJob } from "@/lib/job-dto";
import { getSettings } from "@/lib/settings";
import { rollUpJobHistory } from "@/lib/financial-history";
import {
  getActiveSubscription,
  isSubscriptionBypassed,
  remainingMinutes,
  subscriptionCovers,
} from "@/lib/subscriptions";
import { deleteObject } from "@/lib/storage";
import { isUuid } from "@/lib/uuid";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [job] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, id), eq(jobs.userId, user.id)))
    .limit(1);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let transcript = null;
  if (job.status === "completed") {
    const [row] = await db
      .select()
      .from(transcripts)
      .where(eq(transcripts.jobId, job.id))
      .limit(1);
    transcript = row ?? null;
  }
  const settings = await getSettings();
  const features = isTier(job.tier)
    ? settings.tierFeatures[job.tier]
    : settings.tierFeatures.standard;
  let confirmation = null;
  if (job.status === "awaiting_confirmation" && job.durationSeconds) {
    const rawSub = await getActiveSubscription(user.id);
    const sub = isSubscriptionBypassed(user, settings) ? null : rawSub;
    const tier = job.tier === "premium" ? "premium" : "standard";
    const minutes = Math.max(1, Math.ceil(job.durationSeconds / 60));
    const covering = sub && subscriptionCovers(sub, tier);
    const planMinutes = covering ? Math.min(minutes, remainingMinutes(sub)) : 0;
    const backupCredits = (minutes - planMinutes) * job.creditsPerMinute;
    confirmation = {
      minutes,
      planMinutes,
      backupCredits,
      creditBalance: user.creditBalance,
    };
  }
  return NextResponse.json(
    { job: customerJob(job), transcript, features, confirmation },
    { headers: { "cache-control": "private, no-store" } },
  );
}

// Move a transcript into a folder (or out of one with folderId: null).
const patchSchema = z.object({ folderId: z.string().uuid().nullable() });

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { folderId } = parsed.data;

  // A non-null folder must belong to the same user.
  if (folderId) {
    const [folder] = await db
      .select({ id: folders.id })
      .from(folders)
      .where(and(eq(folders.id, folderId), eq(folders.userId, user.id)))
      .limit(1);
    if (!folder) return NextResponse.json({ error: "Unknown folder" }, { status: 400 });
  }

  const [job] = await db
    .update(jobs)
    .set({ folderId })
    .where(and(eq(jobs.id, id), eq(jobs.userId, user.id)))
    .returning();
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ job: customerJob(job) });
}

/** Delete a terminal or not-yet-confirmed transcription and its retained media. */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
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
  if (["pending", "probing", "downloading", "transcribing"].includes(job.status)) {
    return NextResponse.json(
      { error: "A transcription in progress cannot be deleted. Wait for it to finish first." },
      { status: 409 },
    );
  }
  try {
    if (job.audioKey) await deleteObject(job.audioKey);
    if (job.uploadKey) await deleteObject(job.uploadKey);
  } catch {
    return NextResponse.json(
      { error: "Stored media could not be removed. Nothing was deleted; try again." },
      { status: 503 },
    );
  }
  // A second lock makes concurrent deletion idempotent: only the request that
  // still sees the row rolls its anonymous accounting totals forward.
  await db.transaction(async (tx) => {
    const [lockedJob] = await tx
      .select()
      .from(jobs)
      .where(and(eq(jobs.id, job.id), eq(jobs.userId, user.id)))
      .for("update")
      .limit(1);
    if (!lockedJob) return;
    await rollUpJobHistory(tx, lockedJob);
    await tx.delete(jobs).where(and(eq(jobs.id, lockedJob.id), eq(jobs.userId, user.id)));
  });
  return NextResponse.json({ deleted: true });
}
