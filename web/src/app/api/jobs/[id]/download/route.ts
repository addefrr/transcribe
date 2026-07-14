import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { jobs, transcripts } from "@/lib/schema";
import { segmentsToSrt, segmentsToVtt } from "@/lib/subtitles";
import { isUuid } from "@/lib/uuid";

const FORMATS = {
  txt: { mime: "text/plain" },
  srt: { mime: "application/x-subrip" },
  vtt: { mime: "text/vtt" },
} as const;

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const format = (req.nextUrl.searchParams.get("format") ?? "txt") as keyof typeof FORMATS;
  if (!(format in FORMATS)) {
    return NextResponse.json({ error: "format must be txt, srt or vtt" }, { status: 400 });
  }

  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [row] = await db
    .select({ job: jobs, transcript: transcripts })
    .from(jobs)
    .innerJoin(transcripts, eq(transcripts.jobId, jobs.id))
    .where(and(eq(jobs.id, id), eq(jobs.userId, user.id)))
    .limit(1);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { transcript } = row;
  const content =
    format === "txt"
      ? transcript.text
      : format === "srt"
        ? segmentsToSrt(transcript.segments)
        : segmentsToVtt(transcript.segments);

  const base = (row.job.originalFilename ?? `transcript-${id}`).replace(/\.[^.]+$/, "");
  return new NextResponse(content, {
    headers: {
      "content-type": `${FORMATS[format].mime}; charset=utf-8`,
      "content-disposition": `attachment; filename="${base.replace(/[^\w.-]+/g, "_")}.${format}"`,
    },
  });
}
