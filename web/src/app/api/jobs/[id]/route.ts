import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { folders, jobs, transcripts } from "@/lib/schema";
import { isUuid } from "@/lib/uuid";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
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

  let transcript = null;
  if (job.status === "completed") {
    const [row] = await db
      .select()
      .from(transcripts)
      .where(eq(transcripts.jobId, job.id))
      .limit(1);
    transcript = row ?? null;
  }
  return NextResponse.json({ job, transcript });
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
  return NextResponse.json({ job });
}
