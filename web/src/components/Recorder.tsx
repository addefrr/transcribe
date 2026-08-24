"use client";

import { useEffect, useRef, useState } from "react";
import { useContent } from "@/components/ContentProvider";
import { T } from "@/components/T";

// Records mic audio in the browser (MediaRecorder → Opus/WebM) and hands the
// result back as a File, which the job form then uploads like any other file.
export default function Recorder({ onRecorded }: { onRecorded: (file: File | null) => void }) {
  const t = useContent().recorder;
  const [recording, setRecording] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [paused, setPaused] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const failedRef = useRef(false);
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
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("This browser does not support microphone recording. Upload a file instead.");
      return;
    }
    setRequesting(true);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError(t.micError);
      setRequesting(false);
      return;
    }
    let rec: MediaRecorder;
    try {
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      setRequesting(false);
      setError("The microphone opened, but this browser could not create a recording.");
      return;
    }
    failedRef.current = false;
    chunksRef.current = [];
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      if (failedRef.current) return;
      const type = rec.mimeType || "audio/webm";
      const blob = new Blob(chunksRef.current, { type });
      const ext = type.includes("ogg") ? "ogg" : "webm";
      const name = `recording-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.${ext}`;
      onRecorded(new File([blob], name, { type }));
      setDone(true);
    };
    rec.onerror = () => {
      failedRef.current = true;
      stream.getTracks().forEach((track) => track.stop());
      stopTimer();
      setRecording(false);
      setPaused(false);
      setError("Recording stopped because the browser reported an error. Try again or upload a file.");
    };
    recorderRef.current = rec;
    try {
      rec.start();
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      setRequesting(false);
      setError("Recording could not start. Try again or upload a file.");
      return;
    }
    setRequesting(false);
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
            disabled={requesting}
            className="button-primary"
          >
            <span aria-hidden="true">●</span>{" "}
            {requesting ? "Waiting for microphone permission…" : done ? <T id="recorder.recordAgain" /> : <T id="recorder.start" />}
          </button>
        )}
        {recording && !paused && (
          <button
            type="button"
            onClick={pause}
            className="button-secondary"
          >
            <span aria-hidden="true">❚❚</span> <T id="recorder.pause" />
          </button>
        )}
        {recording && paused && (
          <button
            type="button"
            onClick={resume}
            className="button-primary"
          >
            <span aria-hidden="true">●</span> <T id="recorder.resume" />
          </button>
        )}
        {recording && (
          <button
            type="button"
            onClick={stop}
            className="button-danger"
          >
            <span aria-hidden="true">■</span> <T id="recorder.stop" />
          </button>
        )}
        {recording && (
          <span
            role="timer"
            className={`flex items-center gap-2 text-sm ${paused ? "text-muted" : "text-danger"}`}
          >
            <span
              className="h-2 w-2 rounded-full bg-danger"
            />
            {paused ? <><T id="recorder.paused" /> · {mmss}</> : <>Recording · {mmss}</>}
          </span>
        )}
        {done && !recording && (
          <span role="status" className="text-sm text-success"><T id="recorder.ready" vars={{ time: mmss }} /></span>
        )}
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
