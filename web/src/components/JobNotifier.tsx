"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

// Global watcher (mounted in the layout for signed-in users). Polls the job
// list and, when a job finishes while you're on the site, plays a chime, shows
// an in-app toast, and — if you opted in — a browser notification. It seeds
// known statuses on first load so it never fires for jobs that finished before
// you arrived.

const ACTIVE = new Set(["pending", "probing", "downloading", "transcribing"]);

type Toast = { key: number; jobId: string; name: string; failed: boolean };

export default function JobNotifier() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [muted, setMuted] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const mutedRef = useRef(false);
  const prev = useRef<Map<string, string>>(new Map());
  const seeded = useRef(false);
  const audioCtx = useRef<AudioContext | null>(null);

  useEffect(() => {
    const m = localStorage.getItem("notifySound") === "off";
    setMuted(m);
    mutedRef.current = m;
  }, []);

  function toggleMute() {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    localStorage.setItem("notifySound", next ? "off" : "on");
  }

  function playChime() {
    if (mutedRef.current) return;
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      audioCtx.current ??= new Ctx();
      const ctx = audioCtx.current;
      if (ctx.state === "suspended") ctx.resume();
      const t0 = ctx.currentTime;
      // Two rising notes — a gentle "ta-da".
      [880, 1174.66].forEach((freq, i) => {
        const start = t0 + i * 0.13;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.16, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.32);
      });
    } catch {
      /* audio blocked — the toast still shows */
    }
  }

  function osNotify(name: string, failed: boolean, jobId: string) {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    try {
      const n = new Notification(failed ? "Transcription failed" : "Transcript ready", {
        body: name,
        tag: jobId,
      });
      n.onclick = () => {
        window.focus();
        window.location.href = `/jobs/${jobId}`;
      };
    } catch {
      /* ignore */
    }
  }

  function addToast(t: Toast) {
    setToasts((cur) => [...cur, t]);
    setTimeout(() => setToasts((cur) => cur.filter((x) => x.key !== t.key)), 8000);
  }

  const dismiss = (key: number) => setToasts((cur) => cur.filter((x) => x.key !== key));

  useEffect(() => {
    let stop = false;
    async function poll() {
      try {
        const res = await fetch("/api/jobs");
        if (!res.ok || stop) return;
        const { jobs } = await res.json();
        let anyActive = false;
        for (const j of jobs) {
          if (ACTIVE.has(j.status)) anyActive = true;
          const before = prev.current.get(j.id);
          if (seeded.current && before && ACTIVE.has(before) && !ACTIVE.has(j.status)) {
            const name =
              j.outputName ??
              (j.sourceType === "url" ? j.sourceUrl : j.originalFilename) ??
              "Your recording";
            const failed = j.status === "failed";
            addToast({ key: Date.now() + Math.random(), jobId: j.id, name, failed });
            playChime();
            osNotify(name, failed, j.id);
          }
          prev.current.set(j.id, j.status);
        }
        seeded.current = true;
        // Only offer the opt-in while there's work in progress; drop it once
        // everything has finished so it doesn't linger with nothing to notify.
        setShowPrompt(
          anyActive &&
            typeof Notification !== "undefined" &&
            Notification.permission === "default" &&
            localStorage.getItem("notifyPromptDismissed") !== "1",
        );
      } catch {
        /* transient — next tick retries */
      }
    }
    poll();
    const t = setInterval(poll, 4000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, []);

  async function enableNotifications() {
    try {
      if (typeof Notification !== "undefined") await Notification.requestPermission();
    } catch {
      /* ignore */
    }
    setShowPrompt(false);
    localStorage.setItem("notifyPromptDismissed", "1");
  }

  function dismissPrompt() {
    setShowPrompt(false);
    localStorage.setItem("notifyPromptDismissed", "1");
  }

  if (!showPrompt && toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
      {showPrompt && (
        <div className="rounded-xl border border-line bg-paper p-3 text-sm shadow-lg">
          <p>Want a heads-up when your transcript is ready?</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={enableNotifications}
              className="rounded-md bg-brand px-3 py-1 text-xs font-medium text-brand-ink hover:opacity-90"
            >
              Notify me
            </button>
            <button
              type="button"
              onClick={dismissPrompt}
              className="rounded-md px-3 py-1 text-xs text-muted hover:text-ink"
            >
              No thanks
            </button>
          </div>
        </div>
      )}
      {toasts.map((t) => (
        <div key={t.key} className="rounded-xl border border-line bg-paper p-3 shadow-lg">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {t.failed ? "Transcription failed" : "Transcript ready ✨"}
              </p>
              <p className="truncate text-xs text-muted">{t.name}</p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={toggleMute}
                title={muted ? "Unmute completion sound" : "Mute completion sound"}
                className="text-muted hover:text-ink"
              >
                {muted ? "🔇" : "🔊"}
              </button>
              <button
                type="button"
                onClick={() => dismiss(t.key)}
                className="text-muted hover:text-ink"
              >
                ✕
              </button>
            </div>
          </div>
          {!t.failed && (
            <Link
              href={`/jobs/${t.jobId}`}
              onClick={() => dismiss(t.key)}
              className="mt-1 inline-block text-sm text-brand hover:underline"
            >
              View transcript →
            </Link>
          )}
        </div>
      ))}
    </div>
  );
}
