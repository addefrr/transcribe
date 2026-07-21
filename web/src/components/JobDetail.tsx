"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { fill } from "@/lib/content";
import type { Job, TranscriptSegment } from "@/lib/schema";
import { useContent } from "./ContentProvider";
import JobProgress from "./JobProgress";
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
  // undefined = not yet synced from the job; null = private; string = shared.
  const [shareId, setShareId] = useState<string | null | undefined>(undefined);
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const t = useContent().jobDetail;

  function seek(seconds: number) {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = seconds;
    el.play().catch(() => {});
  }

  async function enableShare() {
    setSharing(true);
    try {
      const res = await fetch(`/api/jobs/${id}/share`, { method: "POST" });
      if (res.ok) setShareId((await res.json()).shareId);
    } finally {
      setSharing(false);
    }
  }

  async function disableShare() {
    setSharing(true);
    try {
      const res = await fetch(`/api/jobs/${id}/share`, { method: "DELETE" });
      if (res.ok) {
        setShareId(null);
        setCopied(false);
      }
    } finally {
      setSharing(false);
    }
  }

  const shareUrl =
    shareId && typeof window !== "undefined"
      ? `${window.location.origin}/share/${shareId}`
      : "";

  async function copyShare() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the URL is selectable in the field */
    }
  }

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
        // Seed the share state once from the job; toggles own it afterward.
        setShareId((prev) => (prev === undefined ? payload.job.shareId : prev));
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

  if (notFound) return <p className="text-sm text-muted">{t.notFound}</p>;
  if (!data) return <p className="text-sm text-muted">Loading…</p>;

  const { job, transcript } = data;
  const source =
    job.outputName ??
    (job.sourceType === "url" ? job.sourceUrl : (job.originalFilename ?? "uploaded file"));

  return (
    <div>
      <Link href="/dashboard" className="text-sm text-brand hover:underline">
        {t.back}
      </Link>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="max-w-xl truncate text-xl font-semibold" title={source ?? ""}>
          {source}
        </h1>
        <StatusBadge status={job.status} />
      </div>
      <p className="mt-1 text-sm text-muted capitalize">
        {job.tier}
        {job.durationSeconds ? ` · ${fmt(job.durationSeconds)} long` : ""}
        {job.language ? ` · ${job.language}` : ""}
        {job.status === "completed"
          ? ` · ${fill(t.creditsUsed, { credits: job.creditsCharged })}`
          : job.creditsHeld > 0
            ? ` · ${fill(t.creditsReserved, { credits: job.creditsHeld })}`
            : ""}
      </p>

      {job.status === "failed" && (
        <div className="mt-6 rounded-md bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-300">
          <p className="font-medium">{t.failed}</p>
          {job.error && <p className="mt-1">{job.error}</p>}
        </div>
      )}

      {ACTIVE.has(job.status) && <JobProgress job={job} />}

      {job.status === "completed" && transcript && (
        <>
          <div className="mt-6 flex flex-wrap gap-3">
            {(
              [
                ["txt", t.downloadTxt],
                ["srt", t.downloadSrt],
                ["vtt", t.downloadVtt],
              ] as const
            ).map(([format, label]) => (
              <a
                key={format}
                href={`/api/jobs/${job.id}/download?format=${format}`}
                className="rounded-md border border-line px-4 py-1.5 text-sm font-medium hover:border-brand"
              >
                ⬇ {label}
              </a>
            ))}
          </div>
          {/* Public sharing */}
          <div className="mt-6 rounded-xl border border-line p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{t.shareHeading}</p>
                <p className="text-sm text-muted">
                  {shareId ? t.shareOnBody : t.shareOffBody}
                </p>
              </div>
              {shareId ? (
                <button
                  type="button"
                  onClick={disableShare}
                  disabled={sharing}
                  className="rounded-md border border-line px-4 py-1.5 text-sm font-medium hover:border-brand disabled:opacity-50"
                >
                  {t.shareStop}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={enableShare}
                  disabled={sharing}
                  className="rounded-md bg-brand px-4 py-1.5 text-sm font-medium text-brand-ink hover:opacity-90 disabled:opacity-50"
                >
                  {sharing ? "Creating…" : t.shareCreate}
                </button>
              )}
            </div>
            {shareId && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  readOnly
                  value={shareUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  className="min-w-0 flex-1 rounded-md border border-line bg-paper-2 px-3 py-1.5 font-mono text-xs outline-none"
                />
                <button
                  type="button"
                  onClick={copyShare}
                  className="rounded-md border border-line px-3 py-1.5 text-sm font-medium hover:border-brand"
                >
                  {copied ? t.shareCopied : t.shareCopy}
                </button>
                <a
                  href={shareUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-brand hover:underline"
                >
                  {t.shareOpen}
                </a>
              </div>
            )}
          </div>
          {job.audioKey && (
            <audio
              ref={audioRef}
              controls
              preload="none"
              src={`/api/jobs/${job.id}/audio`}
              className="mt-6 w-full"
            />
          )}
          <div className="mt-6 space-y-3 rounded-xl border border-line p-6">
            {transcript.segments.map((seg, i) => {
              const showSpeaker =
                seg.speaker && seg.speaker !== transcript.segments[i - 1]?.speaker;
              return (
                <div key={i}>
                  {showSpeaker && (
                    <p className="mt-2 text-xs font-semibold text-brand">
                      {seg.speaker}
                    </p>
                  )}
                  <p className="text-sm leading-relaxed">
                    <button
                      type="button"
                      onClick={() => seek(seg.start)}
                      disabled={!job.audioKey}
                      title={job.audioKey ? "Play from here" : undefined}
                      className={`mr-3 select-none font-mono text-xs ${
                        job.audioKey
                          ? "text-brand hover:underline"
                          : "cursor-default text-muted"
                      }`}
                    >
                      {fmt(seg.start)}
                    </button>
                    {seg.text}
                  </p>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
