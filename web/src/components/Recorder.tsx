"use client";

import { useEffect, useRef, useState } from "react";
import { useContent } from "@/components/ContentProvider";
import { fill } from "@/lib/content";

// Records mic audio in the browser (MediaRecorder → Opus/WebM) and hands the
// result back as a File, which the job form then uploads like any other file.
export default function Recorder({ onRecorded }: { onRecorded: (file: File | null) => void }) {
  const t = useContent().recorder;
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // If we unmount mid-recording (e.g. the user switches away from the Record
  // tab), stop the mic and the clock so the microphone doesn't stay live in the
  // background and the interval doesn't leak. Null onstop first so an abandoned
  // recording isn't handed back as a file.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      const rec = recorderRef.current;
      if (rec) {
        rec.onstop = null;
        try {
          if (rec.state !== "inactive") rec.stop();
        } catch {
          /* already stopping */
        }
        rec.stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  function startTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
  }
  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  async function start() {
    setError(null);
    setDone(false);
    onRecorded(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError(t.micError);
      return;
    }
    const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    chunksRef.current = [];
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const type = rec.mimeType || "audio/webm";
      const blob = new Blob(chunksRef.current, { type });
      const ext = type.includes("ogg") ? "ogg" : "webm";
      const name = `recording-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.${ext}`;
      onRecorded(new File([blob], name, { type }));
      setDone(true);
    };
    recorderRef.current = rec;
    rec.start();
    setRecording(true);
    setPaused(false);
    setSeconds(0);
    startTimer();
  }

  // Pausing keeps the same recording — resuming appends to it — so the whole
  // thing stops the clock and picks up where it left off, no separate files.
  function pause() {
    recorderRef.current?.pause();
    setPaused(true);
    stopTimer();
  }
  function resume() {
    recorderRef.current?.resume();
    setPaused(false);
    startTimer();
  }

  function stop() {
    recorderRef.current?.stop();
    setRecording(false);
    setPaused(false);
    stopTimer();
  }

  const mmss = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <div className="rounded-md border border-line p-4">
      <div className="flex flex-wrap items-center gap-3">
        {!recording && (
          <button
            type="button"
            onClick={start}
            className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-brand-ink hover:opacity-90"
          >
            ● {done ? t.recordAgain : t.start}
          </button>
        )}
        {recording && !paused && (
          <button
            type="button"
            onClick={pause}
            className="rounded-md border border-line px-4 py-2 text-sm font-medium hover:border-brand"
          >
            ❚❚ {t.pause}
          </button>
        )}
        {recording && paused && (
          <button
            type="button"
            onClick={resume}
            className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-brand-ink hover:opacity-90"
          >
            ● {t.resume}
          </button>
        )}
        {recording && (
          <button
            type="button"
            onClick={stop}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-brand-ink hover:bg-red-500"
          >
            ■ {t.stop}
          </button>
        )}
        {recording && (
          <span
            className={`flex items-center gap-2 text-sm ${paused ? "text-muted" : "text-red-600"}`}
          >
            <span
              className={`h-2 w-2 rounded-full bg-red-600 ${paused ? "" : "animate-pulse"}`}
            />
            {paused ? `${t.paused} · ${mmss}` : mmss}
          </span>
        )}
        {done && !recording && (
          <span className="text-sm text-green-600">{fill(t.ready, { time: mmss })}</span>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
