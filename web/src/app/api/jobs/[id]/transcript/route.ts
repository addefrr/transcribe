import { and, desc, eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { jobs, transcriptRevisions, transcripts } from "@/lib/schema";
import { isUuid } from "@/lib/uuid";
import { rateLimit } from "@/lib/ratelimit";

const segmentSchema = z.object({
  start: z.number().finite().nonnegative(),
  end: z.number().finite().nonnegative(),
  text: z.string().max(10_000),
  speaker: z.string().trim().max(80).optional(),
}).refine((segment) => segment.end >= segment.start, {
  message: "A segment cannot end before it starts.",
});

const editSchema = z.object({
  segments: z.array(segmentSchema).max(20_000),
});
const revertSchema = z.object({ revisionId: z.string().uuid() });
const MAX_REVISIONS = 20;

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function pruneRevisions(tx: DbTransaction, jobId: string): Promise<void> {
  await tx.execute(sql`
    DELETE FROM transcript_revisions
    WHERE id IN (
      SELECT id FROM transcript_revisions
      WHERE job_id = ${jobId}
      ORDER BY created_at DESC, id DESC
      OFFSET ${MAX_REVISIONS}
    )
  `);
}

function sameTiming(
  before: { start: number; end: number }[],
  after: { start: number; end: number }[],
): boolean {
  return before.length === after.length && before.every((segment, index) =>
    Math.abs(segment.start - after[index].start) < 0.001 &&
    Math.abs(segment.end - after[index].end) < 0.001
  );
}

async function ownedCompletedJob(userId: string, jobId: string) {
  const [job] = await db
    .select({ id: jobs.id, status: jobs.status })
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.userId, userId)))
    .limit(1);
  return job?.status === "completed" ? job : null;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await ctx.params;
  if (!isUuid(id) || !(await ownedCompletedJob(user.id, id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const revisions = await db
    .select({ id: transcriptRevisions.id, createdAt: transcriptRevisions.createdAt })
    .from(transcriptRevisions)
    .where(eq(transcriptRevisions.jobId, id))
    .orderBy(desc(transcriptRevisions.createdAt))
    .limit(20);
  return NextResponse.json(revisions, { headers: { "cache-control": "private, no-store" } });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await ctx.params;
  if (!isUuid(id) || !(await ownedCompletedJob(user.id, id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const editLimit = await rateLimit(`transcript-edit:${user.id}:${id}`, 60, 60 * 60 * 1000);
  if (!editLimit.ok) {
    return NextResponse.json(
      { error: "Too many transcript changes. Wait before saving again." },
      { status: 429, headers: { "Retry-After": String(editLimit.retryAfterSec) } },
    );
  }
  const raw = await req.json().catch(() => null);
  if (JSON.stringify(raw).length > 2_000_000) {
    return NextResponse.json({ error: "This edit is too large to save at once." }, { status: 413 });
  }
  const parsed = editSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "The edited transcript is not valid." }, { status: 400 });
  }
  const totalCharacters = parsed.data.segments.reduce((sum, segment) => sum + segment.text.length, 0);
  if (totalCharacters > 1_000_000) {
    return NextResponse.json({ error: "This transcript is too large to save." }, { status: 413 });
  }

  const result = await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(transcripts)
      .where(eq(transcripts.jobId, id))
      .limit(1)
      .for("update");
    if (!current || !sameTiming(current.segments, parsed.data.segments)) return null;
    const cleanedSegments = parsed.data.segments.map((segment) => ({
      ...segment,
      text: segment.text.trim(),
    }));
    const [revision] = await tx
      .insert(transcriptRevisions)
      .values({ jobId: id, text: current.text, segments: current.segments })
      .returning({ id: transcriptRevisions.id });
    const text = cleanedSegments.map((segment) => segment.text).filter(Boolean).join("\n");
    const [updated] = await tx
      .update(transcripts)
      .set({ text, segments: cleanedSegments, updatedAt: new Date() })
      .where(eq(transcripts.jobId, id))
      .returning();
    await pruneRevisions(tx, id);
    return { revisionId: revision.id, transcript: updated };
  });
  if (!result) {
    return NextResponse.json(
      { error: "Only transcript text and speaker names can be edited." },
      { status: 400 },
    );
  }
  return NextResponse.json(result);
}

/** Restore a prior revision while preserving the current version as a new revision. */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await ctx.params;
  if (!isUuid(id) || !(await ownedCompletedJob(user.id, id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const editLimit = await rateLimit(`transcript-edit:${user.id}:${id}`, 60, 60 * 60 * 1000);
  if (!editLimit.ok) {
    return NextResponse.json(
      { error: "Too many transcript changes. Wait before restoring another version." },
      { status: 429, headers: { "Retry-After": String(editLimit.retryAfterSec) } },
    );
  }
  const parsed = revertSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid revision" }, { status: 400 });

  const restored = await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(transcripts)
      .where(eq(transcripts.jobId, id))
      .limit(1)
      .for("update");
    const [revision] = await tx
      .select()
      .from(transcriptRevisions)
      .where(
        and(
          eq(transcriptRevisions.id, parsed.data.revisionId),
          eq(transcriptRevisions.jobId, id),
        ),
      )
      .limit(1);
    if (!current || !revision) return null;
    await tx.insert(transcriptRevisions).values({
      jobId: id,
      text: current.text,
      segments: current.segments,
    });
    const [updated] = await tx
      .update(transcripts)
      .set({ text: revision.text, segments: revision.segments, updatedAt: new Date() })
      .where(eq(transcripts.jobId, id))
      .returning();
    await pruneRevisions(tx, id);
    return updated;
  });
  if (!restored) return NextResponse.json({ error: "Revision not found" }, { status: 404 });
  return NextResponse.json({ transcript: restored });
}
