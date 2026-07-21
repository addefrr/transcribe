"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Recorder from "@/components/Recorder";
import { useContent } from "@/components/ContentProvider";
import { fill } from "@/lib/content";
import { LANGUAGES } from "@/lib/languages";
import { isPlaylistUrl } from "@/lib/playlist";
import { estimateCredits, type Tier, type TierConfig } from "@/lib/pricing";

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

export default function NewJobForm({
  tiers,
  usdCentsPerCredit,
}: {
  tiers: Record<Tier, TierConfig>;
  usdCentsPerCredit: number;
}) {
  const t = useContent().newJob;
  const [mode, setMode] = useState<"upload" | "url" | "record">("upload");
  const [tier, setTier] = useState<Tier>("standard");
  const [diarize, setDiarize] = useState(false);
  const [language, setLanguage] = useState(""); // "" = auto-detect
  const [file, setFile] = useState<File | null>(null);
  const [fileDuration, setFileDuration] = useState<number | null>(null);
  const [url, setUrl] = useState("");
  // URL probe (instant cost for pasted links)
  const [urlDuration, setUrlDuration] = useState<number | null>(null);
  const [urlProbing, setUrlProbing] = useState(false);
  const [urlCached, setUrlCached] = useState(false);
  const probeSeq = useRef(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);
  const [playlist, setPlaylist] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const wholePlaylist = playlist && isPlaylistUrl(url.trim());

  // Probe a pasted single-video URL for its length so we can show the cost
  // instantly. Debounced; re-runs when tier/diarize/language change (they change
  // the price and the reuse cache key). Whole-playlist submissions price
  // themselves after expansion, so we skip probing those.
  useEffect(() => {
    const u = url.trim();
    if (mode !== "url" || !u || wholePlaylist) {
      setUrlDuration(null);
      setUrlProbing(false);
      setUrlCached(false);
      return;
    }
    const seq = ++probeSeq.current;
    setUrlProbing(true);
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ url: u, tier, diarize: String(diarize), language });
        const res = await fetch(`/api/probe?${params}`);
        const data = res.ok ? await res.json() : {};
        if (seq !== probeSeq.current) return; // a newer probe superseded this one
        setUrlDuration(typeof data.durationSeconds === "number" ? data.durationSeconds : null);
        setUrlCached(Boolean(data.cached));
      } catch {
        if (seq === probeSeq.current) setUrlDuration(null);
      } finally {
        if (seq === probeSeq.current) setUrlProbing(false);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [mode, url, tier, diarize, language, wholePlaylist]);

  function switchMode(m: "upload" | "url" | "record") {
    setMode(m);
    setFile(null);
    setFileDuration(null);
    setUrl("");
    setError(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function onFileChange(f: File | null) {
    setFile(f);
    setFileDuration(f ? await getMediaDuration(f) : null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setQueued(false);
    try {
      let body: Record<string, unknown>;
      if (mode !== "url") {
        if (!file) throw new Error(mode === "record" ? t.errRecordFirst : t.errChooseFile);
        setBusy(t.busyUploading);
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
          diarize,
        };
      } else {
        if (!url.trim()) throw new Error(t.errPasteUrl);
        // Whole-playlist submissions go through the batch (expand → confirm price).
        if (wholePlaylist) {
          setBusy(t.busyReadingPlaylist);
          const res = await fetch("/api/batches", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ url: url.trim(), tier, language, diarize }),
          });
          if (!res.ok) throw new Error((await res.json()).error ?? "Could not read playlist");
          const { batchId } = await res.json();
          router.push(`/batches/${batchId}`);
          return;
        }
        body = { sourceType: "url", url: url.trim(), tier, language, diarize };
      }

      setBusy(t.busyQueueing);
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

  const duration = mode === "url" ? urlDuration : fileDuration;
  const estimate =
    duration && mode !== "record"
      ? estimateCredits(duration, tiers[tier].creditsPerMinute)
      : mode === "record" && fileDuration
        ? estimateCredits(fileDuration, tiers[tier].creditsPerMinute)
        : null;
  const estDuration = mode === "url" ? urlDuration : fileDuration;

  const tabClass = (active: boolean) =>
    `rounded-md px-4 py-2 text-sm font-medium ${
      active ? "bg-brand text-brand-ink" : "border border-line text-muted hover:border-brand"
    }`;

  return (
    <form onSubmit={submit} className="rounded-xl border border-line p-6">
      <h2 className="text-lg font-semibold">{t.heading}</h2>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={tabClass(mode === "upload")} onClick={() => switchMode("upload")}>
          {t.tabUpload}
        </button>
        <button type="button" className={tabClass(mode === "url")} onClick={() => switchMode("url")}>
          {t.tabUrl}
        </button>
        <button type="button" className={tabClass(mode === "record")} onClick={() => switchMode("record")}>
          {t.tabRecord}
        </button>
      </div>

      <div className="mt-4">
        {mode === "upload" ? (
          <input
            key="file-input"
            ref={fileInput}
            type="file"
            accept="audio/*,video/*"
            onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
            className="block w-full text-sm file:mr-4 file:rounded-md file:border-0 file:bg-paper-2 file:px-4 file:py-2 file:text-sm file:font-medium hover:file:opacity-90"
          />
        ) : mode === "url" ? (
          <input
            key="url-input"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={t.urlPlaceholder}
            className="w-full rounded-md border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-brand"
          />
        ) : (
          <Recorder onRecorded={onFileChange} />
        )}
        {mode === "url" && isPlaylistUrl(url.trim()) && (
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={playlist} onChange={(e) => setPlaylist(e.target.checked)} />
            <span>
              <span className="font-medium">{t.playlistLabel}</span>{" "}
              <span className="text-muted">{t.playlistHint}</span>
            </span>
          </label>
        )}
      </div>

      <fieldset className="mt-5 grid gap-3 sm:grid-cols-2">
        {(Object.entries(tiers) as [Tier, TierConfig][]).map(([id, tc]) => (
          <label
            key={id}
            className={`cursor-pointer rounded-lg border p-4 text-sm ${
              tier === id ? "border-brand ring-1 ring-brand" : "border-line"
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
            <span className="font-medium">{tc.label}</span>{" "}
            <span className="text-muted">
              — {tc.creditsPerMinute} credit{tc.creditsPerMinute > 1 ? "s" : ""}
              {t.perMin}
            </span>
            <p className="mt-1 text-muted">{tc.description}</p>
          </label>
        ))}
      </fieldset>

      <label className="mt-5 block">
        <span className="mb-1 block text-sm text-muted">{t.languageLabel}</span>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="w-full max-w-xs rounded-md border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-brand"
        >
          <option value="">{t.autoDetect}</option>
          <optgroup label={t.langBest}>
            {LANGUAGES.filter((l) => "qwen" in l).map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </optgroup>
          <optgroup label={t.langAll}>
            {[...LANGUAGES]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name}
                </option>
              ))}
          </optgroup>
        </select>
        <span className="mt-1 block text-xs text-muted">{t.languageHelp}</span>
      </label>

      <label className="mt-5 flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={diarize}
          onChange={(e) => {
            setDiarize(e.target.checked);
            if (e.target.checked) setTier("premium"); // diarization needs Premium
          }}
          className="mt-0.5"
        />
        <span>
          <span className="font-medium">{t.recognizeSpeakers}</span>{" "}
          <span className="text-muted">— {t.speakersHelp}</span>
        </span>
      </label>

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={!!busy}
          className="rounded-md bg-brand px-5 py-2 text-sm font-medium text-brand-ink hover:opacity-90 disabled:opacity-50"
        >
          {busy ?? t.submit}
        </button>
        {estimate !== null && estDuration ? (
          <span className="text-sm text-muted">
            {fill(t.estimate, {
              credits: estimate,
              dollars: ((estimate * usdCentsPerCredit) / 100).toFixed(2),
              minutes: Math.ceil(estDuration / 60),
            })}
            {mode === "url" && urlCached ? ` · ${t.estimateCached}` : ""}
          </span>
        ) : mode === "url" && url.trim() && !wholePlaylist ? (
          <span className="text-sm text-muted">
            {urlProbing ? t.estimateChecking : t.estimateUrlUnknown}
          </span>
        ) : null}
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {queued && <p className="mt-3 text-sm text-green-600">{t.queued}</p>}
    </form>
  );
}
