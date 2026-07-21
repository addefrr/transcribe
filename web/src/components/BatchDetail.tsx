"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { estimateCredits } from "@/lib/pricing";
import type { BatchItem, JobBatch } from "@/lib/schema";

function fmtDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function BatchDetail({ id }: { id: string }) {
  const [batch, setBatch] = useState<JobBatch | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let stop = false;
    async function load() {
      const res = await fetch(`/api/batches/${id}`);
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (!res.ok) return;
      const { batch } = await res.json();
      if (!stop) setBatch(batch);
    }
    load();
    const t = setInterval(() => {
      // Keep polling only while the worker is still expanding.
      setBatch((b) => {
        if (b && b.status !== "expanding") clearInterval(t);
        return b;
      });
      load();
    }, 2000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [id]);

  async function start() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/batches/${id}/start`, { method: "POST" });
    if (res.ok) {
      router.push("/dashboard");
      return;
    }
    setError((await res.json()).error ?? "Could not start the playlist.");
    setBusy(false);
  }

  if (notFound) return <p className="text-sm text-zinc-500">Playlist not found.</p>;
  if (!batch) return <p className="text-sm text-zinc-500">Loading…</p>;

  const items = (batch.items ?? []) as BatchItem[];
  const totalCredits = items.reduce(
    (sum, it) => sum + estimateCredits(it.duration ?? 0, batch.creditsPerMinute),
    0,
  );

  return (
    <div>
      <h1 className="text-2xl font-semibold">Playlist</h1>

      {batch.status === "expanding" && (
        <p className="mt-4 animate-pulse text-sm text-zinc-500">
          Reading the playlist and working out the price…
        </p>
      )}

      {batch.status === "failed" && (
        <div className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-300">
          {batch.error ?? "Couldn't read this playlist."}
        </div>
      )}

      {batch.status === "started" && (
        <div className="mt-4 rounded-md bg-green-100 px-4 py-3 text-sm text-green-800 dark:bg-green-950 dark:text-green-300">
          Started! {batch.videoCount} transcriptions are in progress.{" "}
          <a href="/dashboard" className="underline">
            View them
          </a>
          .
        </div>
      )}

      {batch.status === "ready" && (
        <>
          <div className="mt-4 rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
            <p className="text-lg font-semibold">
              {batch.videoCount} videos · {fmtDuration(batch.totalSeconds)} total
            </p>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Estimated cost:{" "}
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                {totalCredits} credits
              </span>{" "}
              ({batch.tier} quality)
            </p>
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            <button
              type="button"
              onClick={start}
              disabled={busy}
              className="mt-4 rounded-md bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {busy ? "Starting…" : `Transcribe all — ${totalCredits} credits`}
            </button>
          </div>

          <ul className="mt-6 divide-y divide-zinc-100 text-sm dark:divide-zinc-900">
            {items.map((it, i) => (
              <li key={i} className="flex items-center justify-between py-2">
                <span className="max-w-md truncate">{it.title || it.url}</span>
                <span className="text-zinc-500">
                  {it.duration ? fmtDuration(it.duration) : "—"}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
