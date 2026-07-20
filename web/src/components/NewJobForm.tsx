"use client";

import { useRef, useState } from "react";
import { LANGUAGES } from "@/lib/languages";
import { estimateCredits, TIERS, type Tier } from "@/lib/pricing";

async function getMediaDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement(file.type.startsWith("video/") ? "video" : "audio");
    el.preload = "metadata";
    el.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(el.duration) ? el.duration : null);
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    el.src = url;
  });
}

export default function NewJobForm() {
  const [mode, setMode] = useState<"upload" | "url">("upload");
  const [tier, setTier] = useState<Tier>("standard");
  const [language, setLanguage] = useState(""); // "" = auto-detect
  const [file, setFile] = useState<File | null>(null);
  const [fileDuration, setFileDuration] = useState<number | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function onFileChange(f: File | null) {
    setFile(f);
    setFileDuration(f ? await getMediaDuration(f) : null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setQueued(false);
    try {
      let body: Record<string, string>;
      if (mode === "upload") {
        if (!file) throw new Error("Choose a file first.");
        setBusy("Uploading…");
        const prep = await fetch("/api/uploads", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            filename: file.name,
            size: file.size,
            contentType: file.type || "application/octet-stream",
          }),
        });
        if (!prep.ok) throw new Error((await prep.json()).error ?? "Upload failed");
        const { key, uploadUrl } = await prep.json();
        // Explicit header: presigned S3 PUTs sign the content-type from the
        // prepare call, and fetch omits the header when file.type is "".
        const put = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "content-type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!put.ok) throw new Error("Upload failed — try again.");
        body = {
          sourceType: "upload",
          uploadKey: key,
          originalFilename: file.name,
          tier,
          language,
        };
      } else {
        if (!url.trim()) throw new Error("Paste a URL first.");
        body = { sourceType: "url", url: url.trim(), tier, language };
      }

      setBusy("Queueing job…");
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not create job");
      setQueued(true);
      setFile(null);
      setFileDuration(null);
      setUrl("");
      if (fileInput.current) fileInput.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  const estimate =
    mode === "upload" && fileDuration ? estimateCredits(fileDuration, tier) : null;

  const tabClass = (active: boolean) =>
    `rounded-md px-4 py-2 text-sm font-medium ${
      active
        ? "bg-indigo-600 text-white"
        : "border border-zinc-300 text-zinc-600 hover:border-indigo-400 dark:border-zinc-700 dark:text-zinc-300"
    }`;

  return (
    <form
      onSubmit={submit}
      className="rounded-xl border border-zinc-200 p-6 dark:border-zinc-800"
    >
      <h2 className="text-lg font-semibold">Start a transcription</h2>

      <div className="mt-4 flex gap-2">
        <button type="button" className={tabClass(mode === "upload")} onClick={() => setMode("upload")}>
          Upload a file
        </button>
        <button type="button" className={tabClass(mode === "url")} onClick={() => setMode("url")}>
          Paste a link
        </button>
      </div>

      <div className="mt-4">
        {mode === "upload" ? (
          <input
            ref={fileInput}
            type="file"
            accept="audio/*,video/*"
            onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
            className="block w-full text-sm file:mr-4 file:rounded-md file:border-0 file:bg-zinc-100 file:px-4 file:py-2 file:text-sm file:font-medium hover:file:bg-zinc-200 dark:file:bg-zinc-800 dark:hover:file:bg-zinc-700"
          />
        ) : (
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste a YouTube or audio/video link…"
            className="w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-zinc-700"
          />
        )}
      </div>

      <fieldset className="mt-5 grid gap-3 sm:grid-cols-2">
        {(Object.entries(TIERS) as [Tier, (typeof TIERS)[Tier]][]).map(([id, t]) => (
          <label
            key={id}
            className={`cursor-pointer rounded-lg border p-4 text-sm ${
              tier === id
                ? "border-indigo-500 ring-1 ring-indigo-500"
                : "border-zinc-300 dark:border-zinc-700"
            }`}
          >
            <input
              type="radio"
              name="tier"
              value={id}
              checked={tier === id}
              onChange={() => setTier(id)}
              className="mr-2"
            />
            <span className="font-medium">{t.label}</span>{" "}
            <span className="text-zinc-500">
              — {t.creditsPerMinute} credit{t.creditsPerMinute > 1 ? "s" : ""}/min
            </span>
            <p className="mt-1 text-zinc-500">{t.description}</p>
          </label>
        ))}
      </fieldset>

      <label className="mt-5 block">
        <span className="mb-1 block text-sm text-zinc-600 dark:text-zinc-400">Language</span>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="w-full max-w-xs rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-zinc-700"
        >
          <option value="">Auto-detect (recommended)</option>
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.name}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-zinc-500">
          Leave this on Auto-detect and we&apos;ll figure it out. If you already know the
          language, choosing it can improve accuracy.
        </span>
      </label>

      <div className="mt-5 flex items-center gap-4">
        <button
          type="submit"
          disabled={!!busy}
          className="rounded-md bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {busy ?? "Start transcription"}
        </button>
        {estimate !== null && (
          <span className="text-sm text-zinc-500">
            About {estimate} credit{estimate > 1 ? "s" : ""} ({Math.ceil(fileDuration! / 60)} min)
          </span>
        )}
        {mode === "url" && (
          <span className="text-sm text-zinc-500">
            We&apos;ll work out the cost from the length before we start.
          </span>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {queued && (
        <p className="mt-3 text-sm text-green-600">
          All set! Your transcription is in progress below.
        </p>
      )}
    </form>
  );
}
