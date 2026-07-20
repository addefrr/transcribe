"use client";

import { useRef, useState } from "react";

// Records mic audio in the browser (MediaRecorder → Opus/WebM) and hands the
// result back as a File, which the job form then uploads like any other file.
export default function Recorder({ onRecorded }: { onRecorded: (file: File | null) => void }) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function start() {
    setError(null);
    setDone(false);
    onRecorded(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Couldn't access your microphone. Check your browser permissions.");
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
    setSeconds(0);
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
  }

  function stop() {
    recorderRef.current?.stop();
    setRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
  }

  const mmss = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <div className="rounded-md border border-zinc-300 p-4 dark:border-zinc-700">
      <div className="flex items-center gap-3">
        {recording ? (
          <button
            type="button"
            onClick={stop}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500"
          >
            ■ Stop
          </button>
        ) : (
          <button
            type="button"
            onClick={start}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            ● {done ? "Record again" : "Start recording"}
          </button>
        )}
        {recording && (
          <span className="flex items-center gap-2 text-sm text-red-600">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-600" /> {mmss}
          </span>
        )}
        {done && !recording && (
          <span className="text-sm text-green-600">Recorded {mmss} — ready to transcribe.</span>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
