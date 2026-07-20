"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Job, TranscriptSegment } from "@/lib/schema";
import StatusBadge from "./StatusBadge";

type Payload = {
  job: Job;
  transcript: { text: string; segments: TranscriptSegment[] } | null;
};

const ACTIVE = new Set(["pending", "probing", "downloading", "transcribing"]);

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function JobDetail({ id }: { id: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let stop = false;
    async function load() {
      try {
        const res = await fetch(`/api/jobs/${id}`);
        if (res.status === 404) {
          setNotFound(true);
          clearInterval(timer);
          return;
        }
        if (!res.ok) return;
        const payload: Payload = await res.json();
        if (stop) return;
        setData(payload);
        if (!ACTIVE.has(payload.job.status)) clearInterval(timer);
      } catch {
        /* retry on next tick */
      }
    }
    const timer = setInterval(load, 2000);
    load();
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [id]);

  if (notFound) return <p className="text-sm text-zinc-500">Job not found.</p>;
  if (!data) return <p className="text-sm text-zinc-500">Loading…</p>;

  const { job, transcript } = data;
  const source =
    job.sourceType === "url" ? job.sourceUrl : (job.originalFilename ?? "uploaded file");

  return (
    <div>
      <Link href="/dashboard" className="text-sm text-indigo-600 hover:underline dark:text-indigo-400">
        ← Back to my transcriptions
      </Link>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="max-w-xl truncate text-xl font-semibold" title={source ?? ""}>
          {source}
        </h1>
        <StatusBadge status={job.status} />
      </div>
      <p className="mt-1 text-sm text-zinc-500 capitalize">
        {job.tier}
        {job.durationSeconds ? ` · ${fmt(job.durationSeconds)} long` : ""}
        {job.language ? ` · ${job.language}` : ""}
        {job.status === "completed"
          ? ` · ${job.creditsCharged} credits used`
          : job.creditsHeld > 0
            ? ` · ${job.creditsHeld} credits reserved`
            : ""}
      </p>

      {job.status === "failed" && (
        <div className="mt-6 rounded-md bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-300">
          <p className="font-medium">
            Something went wrong — you weren&apos;t charged, your credits were returned.
          </p>
          {job.error && <p className="mt-1">{job.error}</p>}
        </div>
      )}

      {ACTIVE.has(job.status) && (
        <p className="mt-6 animate-pulse text-sm text-zinc-500">
          Transcribing your recording — this page updates on its own.
        </p>
      )}

      {job.status === "completed" && transcript && (
        <>
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
                href={`/api/jobs/${job.id}/download?format=${format}`}
                className="rounded-md border border-zinc-300 px-4 py-1.5 text-sm font-medium hover:border-indigo-500 dark:border-zinc-700"
              >
                ⬇ {label}
              </a>
            ))}
          </div>
          <div className="mt-6 space-y-3 rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
            {transcript.segments.map((seg, i) => (
              <p key={i} className="text-sm leading-relaxed">
                <span className="mr-3 select-none font-mono text-xs text-zinc-400">
                  {fmt(seg.start)}
                </span>
                {seg.text}
              </p>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
