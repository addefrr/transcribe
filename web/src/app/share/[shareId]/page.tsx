import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { jobs, transcripts } from "@/lib/schema";

export const dynamic = "force-dynamic";

const SHARE_ID = /^[A-Za-z0-9_-]{16,64}$/;

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

async function load(shareId: string) {
  if (!SHARE_ID.test(shareId)) return null;
  const [row] = await db
    .select({ job: jobs, transcript: transcripts })
    .from(jobs)
    .innerJoin(transcripts, eq(transcripts.jobId, jobs.id))
    .where(eq(jobs.shareId, shareId))
    .limit(1);
  return row ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ shareId: string }>;
}): Promise<Metadata> {
  const { shareId } = await params;
  const row = await load(shareId);
  const title = row?.job.outputName ?? "Shared transcript";
  return { title: `${title} — Transcribe`, robots: { index: false } };
}

export default async function SharePage({
  params,
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = await params;
  const row = await load(shareId);
  if (!row) notFound();

  const { job, transcript } = row;
  const title = job.outputName ?? "Transcript";

  return (
    <div className="py-10">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">
        Shared transcript
      </p>
      <h1 className="mt-1 max-w-2xl text-2xl font-semibold">{title}</h1>
      <p className="mt-1 text-sm text-muted capitalize">
        {job.tier}
        {job.durationSeconds ? ` · ${fmt(job.durationSeconds)} long` : ""}
        {job.language ? ` · ${job.language}` : ""}
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        {(
          [
            ["txt", "Text file"],
            ["srt", "Subtitles (SRT)"],
            ["vtt", "Subtitles (VTT)"],
          ] as const
        ).map(([format, label]) => (
          <a
            key={format}
            href={`/api/share/${shareId}/download?format=${format}`}
            className="rounded-md border border-line px-4 py-1.5 text-sm font-medium hover:border-brand"
          >
            ⬇ {label}
          </a>
        ))}
      </div>

      <div className="mt-6 space-y-3 rounded-xl border border-line p-6">
        {transcript.segments.map((seg, i) => {
          const showSpeaker =
            seg.speaker && seg.speaker !== transcript.segments[i - 1]?.speaker;
          return (
            <div key={i}>
              {showSpeaker && (
                <p className="mt-2 text-xs font-semibold text-brand">{seg.speaker}</p>
              )}
              <p className="text-sm leading-relaxed">
                <span className="mr-3 select-none font-mono text-xs text-muted">
                  {fmt(seg.start)}
                </span>
                {seg.text}
              </p>
            </div>
          );
        })}
      </div>

      <p className="mt-8 text-sm text-muted">
        Transcribed with{" "}
        <Link href="/" className="text-brand hover:underline">
          Transcribe
        </Link>
        {" "}— turn any audio or video into text.
      </p>
    </div>
  );
}
