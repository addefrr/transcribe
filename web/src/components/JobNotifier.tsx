"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

// Global watcher mounted for signed-in users. It seeds the current statuses so
// an existing result never looks newly completed, then reports only actual
// terminal transitions. Browser notifications and completion sound both require
// an explicit user choice.

const ACTIVE = new Set(["pending", "probing", "downloading", "transcribing"]);
const TERMINAL = new Set(["completed", "failed"]);
const VISIBLE_POLL_MS = 4_000;
const IDLE_POLL_MS = 30_000;
const HIDDEN_POLL_MS = 60_000;

type WatchedJob = {
  id: string;
  status: string;
  outputName?: string | null;
  sourceType: string;
  sourceUrl?: string | null;
  originalFilename?: string | null;
};

type Toast = {
  key: string;
  jobId: string;
  name: string;
  failed: boolean;
};

function notificationName(job: WatchedJob): string {
  return (
    job.outputName ??
    (job.sourceType === "url" ? "Linked media" : job.originalFilename) ??
    "Your recording"
  );
}

export default function JobNotifier() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const soundEnabledRef = useRef(false);
  const previousStatuses = useRef<Map<string, string>>(new Map());
  const seeded = useRef(false);
  const audioContext = useRef<AudioContext | null>(null);
  const toastSequence = useRef(0);
  const successTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const enabled = localStorage.getItem("notifySound") === "on";
    setSoundEnabled(enabled);
    soundEnabledRef.current = enabled;
  }, []);

  useEffect(
    () => () => {
      for (const timer of successTimers.current.values()) clearTimeout(timer);
      successTimers.current.clear();
      void audioContext.current?.close().catch(() => {});
    },
    [],
  );

  function toggleSound() {
    const next = !soundEnabledRef.current;
    soundEnabledRef.current = next;
    setSoundEnabled(next);
    localStorage.setItem("notifySound", next ? "on" : "off");

    // Create/resume the context only in response to the user's gesture. No
    // sound is played by this preference control.
    if (next) {
      try {
        const Context =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (Context) {
          audioContext.current ??= new Context();
          if (audioContext.current.state === "suspended") {
            void audioContext.current.resume().catch(() => {});
          }
        }
      } catch {
        // The visual and browser notifications remain available.
      }
    }
  }

  function playCompletionChime() {
    if (!soundEnabledRef.current) return;
    try {
      const Context =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Context) return;
      audioContext.current ??= new Context();
      const context = audioContext.current;
      if (context.state === "suspended") void context.resume().catch(() => {});
      const start = context.currentTime;
      for (const [index, frequency] of [880, 1174.66].entries()) {
        const noteStart = start + index * 0.13;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, noteStart);
        gain.gain.exponentialRampToValueAtTime(0.12, noteStart + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.3);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(noteStart);
        oscillator.stop(noteStart + 0.32);
      }
    } catch {
      // The in-app notification remains visible.
    }
  }

  function sendBrowserNotification(name: string, failed: boolean, jobId: string) {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    try {
      const notification = new Notification(
        failed ? "Transcription failed" : "Transcript ready",
        { body: name, tag: jobId },
      );
      notification.onclick = () => {
        notification.close();
        window.focus();
        window.location.assign(`/jobs/${jobId}`);
      };
    } catch {
      // The in-app notification remains visible.
    }
  }

  function dismiss(key: string) {
    const timer = successTimers.current.get(key);
    if (timer) clearTimeout(timer);
    successTimers.current.delete(key);
    setToasts((current) => current.filter((toast) => toast.key !== key));
  }

  function addToast(jobId: string, name: string, failed: boolean) {
    const key = `${jobId}-${++toastSequence.current}`;
    const toast = { key, jobId, name, failed };
    setToasts((current) => [...current, toast]);

    // A successful completion remains available from the dashboard and may
    // clear after a generous interval. Failures require explicit dismissal.
    if (!failed) {
      const timer = setTimeout(() => {
        successTimers.current.delete(key);
        setToasts((current) => current.filter((candidate) => candidate.key !== key));
      }, 12_000);
      successTimers.current.set(key, timer);
    }
  }

  useEffect(() => {
    let stopped = false;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | null = null;

    function schedule(active = false) {
      if (stopped) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(
        poll,
        document.hidden ? HIDDEN_POLL_MS : active ? VISIBLE_POLL_MS : IDLE_POLL_MS,
      );
    }

    async function poll() {
      if (stopped || inFlight) return;
      inFlight = true;
      const request = new AbortController();
      controller = request;
      let anyActive = false;
      try {
        const response = await fetch("/api/jobs", {
          cache: "no-store",
          signal: request.signal,
        });
        if (!response.ok || stopped) return;
        const payload: { jobs: WatchedJob[] } = await response.json();
        for (const job of payload.jobs) {
          if (ACTIVE.has(job.status)) anyActive = true;
          const previous = previousStatuses.current.get(job.id);
          if (
            seeded.current &&
            previous &&
            ACTIVE.has(previous) &&
            TERMINAL.has(job.status)
          ) {
            const name = notificationName(job);
            const failed = job.status === "failed";
            addToast(job.id, name, failed);
            if (!failed) playCompletionChime();
            sendBrowserNotification(name, failed, job.id);
          }
          previousStatuses.current.set(job.id, job.status);
        }

        seeded.current = true;
        setShowPrompt(
          anyActive &&
            typeof Notification !== "undefined" &&
            Notification.permission === "default" &&
            localStorage.getItem("notifyPromptDismissed") !== "1",
        );
      } catch (caught) {
        if (!(caught instanceof Error && caught.name === "AbortError")) {
          // A later poll retries; persistent job failures are reported by the API state.
        }
      } finally {
        if (controller === request) controller = null;
        inFlight = false;
        schedule(anyActive);
      }
    }

    function onVisibilityChange() {
      if (timer) clearTimeout(timer);
      timer = undefined;
      if (document.hidden) {
        schedule();
      } else {
        void poll();
      }
    }

    void poll();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      controller?.abort();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  async function enableNotifications() {
    try {
      if (typeof Notification !== "undefined") await Notification.requestPermission();
    } catch {
      // The in-app notification remains available.
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
    <section
      aria-label="Transcription notifications"
      className="fixed bottom-4 right-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
    >
      {showPrompt && (
        <div className="rounded-xl border border-line bg-paper p-4 text-sm shadow-lg">
          <h2 className="font-semibold">Get a completion notification?</h2>
          <p className="mt-1 text-muted">
            Browser notifications are optional. Completion sound stays off unless you turn it on.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={enableNotifications}
              className="min-h-11 rounded-md bg-brand px-3 py-2 text-sm font-medium text-brand-ink hover:opacity-90"
            >
              Enable browser notifications
            </button>
            <button
              type="button"
              onClick={toggleSound}
              aria-pressed={soundEnabled}
              className="min-h-11 rounded-md border border-line px-3 py-2 text-sm hover:border-ink"
            >
              {soundEnabled ? "Turn sound off" : "Turn sound on"}
            </button>
            <button
              type="button"
              onClick={dismissPrompt}
              className="min-h-11 rounded-md px-3 py-2 text-sm text-muted hover:text-ink"
            >
              Not now
            </button>
          </div>
        </div>
      )}

      {toasts.map((toast) => (
        <div
          key={toast.key}
          className={`rounded-xl border bg-paper p-4 shadow-lg ${
            toast.failed ? "border-danger/30" : "border-line"
          }`}
        >
          <div
            role={toast.failed ? "alert" : "status"}
            aria-live={toast.failed ? "assertive" : "polite"}
            aria-atomic="true"
          >
            <p className="text-sm font-semibold">
              {toast.failed ? "Transcription failed" : "Transcript ready"}
            </p>
            <p className="mt-1 break-words text-xs text-muted">{toast.name}</p>
            {toast.failed && (
              <p className="mt-2 text-xs text-muted">
                Open the job to see what happened and the available recovery steps.
              </p>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <Link
              href={`/jobs/${toast.jobId}`}
              onClick={() => dismiss(toast.key)}
              className="inline-flex min-h-11 items-center text-sm font-medium text-brand hover:underline"
            >
              {toast.failed ? "Review failed job" : "View transcript"}
              <span aria-hidden="true">&nbsp;→</span>
            </Link>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={toggleSound}
                aria-pressed={soundEnabled}
                aria-label={soundEnabled ? "Turn completion sound off" : "Turn completion sound on"}
                className="grid h-11 w-11 place-items-center rounded-md text-muted hover:bg-paper-2 hover:text-ink"
              >
                <span aria-hidden="true">{soundEnabled ? "🔊" : "🔇"}</span>
              </button>
              <button
                type="button"
                onClick={() => dismiss(toast.key)}
                aria-label={`Dismiss ${toast.failed ? "failure" : "completion"} notification`}
                className="grid h-11 w-11 place-items-center rounded-md text-muted hover:bg-paper-2 hover:text-ink"
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}
