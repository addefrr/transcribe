import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jobs, transcripts } from "@/lib/schema";
import { segmentsToSrt, segmentsToTxt, segmentsToVtt } from "@/lib/subtitles";

const FORMATS = {
  txt: { mime: "text/plain" },
  srt: { mime: "application/x-subrip" },
  vtt: { mime: "text/vtt" },
} as const;

// share tokens are base64url of 16 random bytes (22 chars).
const SHARE_ID = /^[A-Za-z0-9_-]{16,64}$/;

export async function GET(req: NextRequest, ctx: { params: Promise<{ shareId: string }> }) {
  const format = (req.nextUrl.searchParams.get("format") ?? "txt") as keyof typeof FORMATS;
  if (!(format in FORMATS)) {
    return NextResponse.json({ error: "format must be txt, srt or vtt" }, { status: 400 });
  }

  const { shareId } = await ctx.params;
  if (!SHARE_ID.test(shareId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [row] = await db
    .select({ job: jobs, transcript: transcripts })
    .from(jobs)
    .innerJoin(transcripts, eq(transcripts.jobId, jobs.id))
    .where(eq(jobs.shareId, shareId))
    .limit(1);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { transcript } = row;
  const content =
    format === "txt"
      ? segmentsToTxt(transcript.segments)
      : format === "srt"
        ? segmentsToSrt(transcript.segments)
        : segmentsToVtt(transcript.segments);

  const base = (row.job.outputName ?? `transcript-${shareId}`).replace(/\.[^.]+$/, "");
  return new NextResponse(content, {
    headers: {
      "content-type": `${FORMATS[format].mime}; charset=utf-8`,
      "content-disposition": `attachment; filename="${base.replace(/[^\w.-]+/g, "_")}.${format}"`,
    },
  });
}
