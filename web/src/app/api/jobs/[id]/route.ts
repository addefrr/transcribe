import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { jobs, transcripts } from "@/lib/schema";
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
