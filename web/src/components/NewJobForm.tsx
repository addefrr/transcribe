"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import Recorder from "@/components/Recorder";
import { useContent } from "@/components/ContentProvider";
import { T } from "@/components/T";
import { LANGUAGES } from "@/lib/languages";
import { isPlaylistUrl } from "@/lib/playlist";
import { estimateCredits, type Tier, type TierConfig, type TierFeatures } from "@/lib/pricing";

type ProviderRoute = { provider: string; model: string };

async function getMediaDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const element = document.createElement(file.type.startsWith("video/") ? "video" : "audio");
    let settled = false;
    const finish = (duration: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      element.removeAttribute("src");
      URL.revokeObjectURL(url);
      resolve(duration);
    };
    const timeout = window.setTimeout(() => finish(null), 10_000);
    element.preload = "metadata";
    element.onloadedmetadata = () => {
      finish(Number.isFinite(element.duration) ? element.duration : null);
    };
    element.onerror = () => finish(null);
    element.src = url;
  });
}

export default function NewJobForm({
  tiers,
  tierFeatures,
  usdCentsPerCredit,
  subscriptionTier,
  subscriptionMinutesLeft,
  providerRoutes,
  audioRetentionDays,
  maxFileMb,
  maxDurationHours,
  emailVerified,
}: {
  tiers: Record<Tier, TierConfig>;
  tierFeatures: Record<Tier, TierFeatures>;
  usdCentsPerCredit: number;
  subscriptionTier: string | null;
  subscriptionMinutesLeft: number;
  providerRoutes: Record<Tier, ProviderRoute>;
  audioRetentionDays: number;
  maxFileMb: number;
  maxDurationHours: number;
  emailVerified: boolean;
}) {
  const t = useContent().newJob;
  const [mode, setMode] = useState<"upload" | "url" | "record">("upload");
  const [tier, setTier] = useState<Tier>("standard");
  const [diarize, setDiarize] = useState(false);
  const [language, setLanguage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileDuration, setFileDuration] = useState<number | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);
  const [playlist, setPlaylist] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const wholePlaylist = playlist && isPlaylistUrl(url.trim());
  const duration = mode === "url" ? null : fileDuration;
  const estimatedMinutes = duration ? Math.max(1, Math.ceil(duration / 60)) : null;
  const estimate = duration ? estimateCredits(duration, tiers[tier].creditsPerMinute) : null;
  const subscriptionCoversTier =
    subscriptionTier !== null && (subscriptionTier === "premium" || tier === "standard");
  const planMinutes = estimatedMinutes && subscriptionCoversTier
    ? Math.min(estimatedMinutes, subscriptionMinutesLeft)
    : 0;
  const backupCredits = estimatedMinutes
    ? (estimatedMinutes - planMinutes) * tiers[tier].creditsPerMinute
    : 0;

  function switchMode(next: "upload" | "url" | "record") {
    setMode(next);
    setError(null);
    setQueued(false);
  }

  async function onFileChange(next: File | null) {
    setError(null);
    if (next && next.size > maxFileMb * 1024 * 1024) {
      setFile(null);
      setFileDuration(null);
      setError(`That file is larger than the ${maxFileMb} MB limit.`);
      return;
    }
    setFile(next);
    const mediaDuration = next ? await getMediaDuration(next) : null;
    if (mediaDuration && mediaDuration > maxDurationHours * 3600) {
      setFile(null);
      setFileDuration(null);
      setError(`That recording is longer than the ${maxDurationHours}-hour limit.`);
      if (fileInput.current) fileInput.current.value = "";
      return;
    }
    setFileDuration(mediaDuration);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!emailVerified) {
      setError("Verify your email address before starting a transcription.");
      return;
    }
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
        if (!prep.ok) throw new Error((await prep.json()).error ?? "Upload could not be prepared.");
        const { key, uploadUrl } = await prep.json();
        const upload = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "content-type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!upload.ok) throw new Error("The upload did not finish. Your file was not queued; try again.");
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
        if (wholePlaylist) {
          setBusy(t.busyReadingPlaylist);
          const response = await fetch("/api/batches", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ url: url.trim(), tier, language, diarize }),
          });
          if (!response.ok) throw new Error((await response.json()).error ?? "The playlist could not be read.");
          const { batchId } = await response.json();
          router.push(`/batches/${batchId}`);
          return;
        }
        body = { sourceType: "url", url: url.trim(), tier, language, diarize };
      }

      setBusy(mode === "url" ? "Queueing a safe duration check…" : t.busyQueueing);
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "The transcription could not be created.");
      window.dispatchEvent(new Event("transcribe:job-created"));
      if (result.requiresConfirmation) {
        router.push(`/jobs/${result.job.id}`);
        return;
      }
      setQueued(true);
      setFile(null);
      setFileDuration(null);
      if (fileInput.current) fileInput.current.value = "";
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong. Your request was not queued.");
    } finally {
      setBusy(null);
    }
  }

  const modeClass = (active: boolean) =>
    `button-tab ${active ? "button-tab-active" : ""}`;

  return (
    <form onSubmit={submit} className="border-y border-line py-6" aria-labelledby="new-job-heading">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">New transcription</p>
          <h2 id="new-job-heading" className="section-title"><T id="newJob.heading" /></h2>
        </div>
        <p className="text-sm text-muted">Maximum {maxDurationHours} hours · {maxFileMb} MB per file</p>
      </div>

      {!emailVerified && (
        <p role="status" className="status-info mt-5">Verify your email to enable transcription.</p>
      )}

      <fieldset className="mt-6">
        <legend className="field-label">Where is the recording?</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" aria-pressed={mode === "upload"} className={modeClass(mode === "upload")} onClick={() => switchMode("upload")}><T id="newJob.tabUpload" /></button>
          <button type="button" aria-pressed={mode === "url"} className={modeClass(mode === "url")} onClick={() => switchMode("url")}><T id="newJob.tabUrl" /></button>
          <button type="button" aria-pressed={mode === "record"} className={modeClass(mode === "record")} onClick={() => switchMode("record")}><T id="newJob.tabRecord" /></button>
        </div>
      </fieldset>

      <div className="mt-5 max-w-3xl">
        {mode === "upload" ? (
          <div>
            <label htmlFor="media-file" className="field-label">Audio or video file</label>
            <input
              id="media-file"
              ref={fileInput}
              type="file"
              accept="audio/*,video/*"
              onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
              aria-describedby="media-file-help"
              className="mt-1 block w-full text-sm file:mr-4 file:min-h-11 file:rounded-md file:border file:border-line file:bg-paper-2 file:px-4 file:py-2 file:text-sm file:font-medium"
            />
            <p id="media-file-help" className="mt-1 text-sm text-muted">The source upload is removed after processing finishes or fails.</p>
          </div>
        ) : mode === "url" ? (
          <div>
            <label htmlFor="media-url" className="field-label">Public audio, video, or playlist URL</label>
            <input
              id="media-url"
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://www.youtube.com/watch?v=…"
              aria-describedby="media-url-help"
              className="field-input mt-1 w-full"
            />
            <p id="media-url-help" className="mt-1 text-sm text-muted">A separate worker inspects the duration first. You see and confirm the exact price before transcription begins.</p>
            {isPlaylistUrl(url.trim()) && (
              <label className="mt-3 flex min-h-11 items-center gap-3 text-sm">
                <input type="checkbox" checked={playlist} onChange={(event) => setPlaylist(event.target.checked)} />
                <span><span className="font-medium"><T id="newJob.playlistLabel" /></span> <span className="text-muted"><T id="newJob.playlistHint" /></span></span>
              </label>
            )}
          </div>
        ) : (
          <div>
            <p className="field-label">Microphone recording</p>
            <Recorder onRecorded={onFileChange} />
            <p className="mt-2 text-sm text-muted">
              Recording stays in this browser until you submit it. Your browser will ask before using the microphone.
            </p>
          </div>
        )}
      </div>

      <fieldset className="mt-7">
        <legend className="field-label">Transcription quality</legend>
        <div className="mt-2 grid max-w-4xl gap-px border border-line bg-line sm:grid-cols-2">
          {(Object.entries(tiers) as [Tier, TierConfig][]).map(([id, config]) => {
            const cardCovered =
              subscriptionTier !== null && (subscriptionTier === "premium" || id === "standard");
            return (
            <label key={id} className={`cursor-pointer bg-paper p-4 text-sm ${tier === id ? "ring-2 ring-inset ring-brand" : ""}`}>
              <span className="flex items-center gap-2">
                <input
                  type="radio"
                  name="tier"
                  value={id}
                  checked={tier === id}
                  onChange={() => {
                    setTier(id);
                    setNotice(null);
                    if (!tierFeatures[id].speakerLabels) setDiarize(false);
                  }}
                />
                <span className="font-semibold">{config.label}</span>
              </span>
              <span className="mt-2 block text-muted">{config.description}</span>
              <span className="mt-2 block text-muted">{providerRoutes[id].provider} · {providerRoutes[id].model}</span>
              {!cardCovered && <span className="mt-1 block text-muted">{config.creditsPerMinute} credit{config.creditsPerMinute === 1 ? "" : "s"} per started minute</span>}
            </label>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <label>
          <span className="field-label"><T id="newJob.languageLabel" /></span>
          <select value={language} onChange={(event) => setLanguage(event.target.value)} className="field-input mt-1 w-full">
            <option value="">{t.autoDetect}</option>
            <optgroup label={t.langBest}>
              {LANGUAGES.filter((entry) => "popular" in entry).map((entry) => <option key={entry.code} value={entry.code}>{entry.name}</option>)}
            </optgroup>
            <optgroup label={t.langAll}>
              {LANGUAGES.filter((entry) => !("popular" in entry)).sort((a, b) => a.name.localeCompare(b.name)).map((entry) => <option key={entry.code} value={entry.code}>{entry.name}</option>)}
            </optgroup>
          </select>
          <span className="mt-1 block text-sm text-muted"><T id="newJob.languageHelp" /></span>
        </label>

        <label className="flex min-h-11 items-start gap-3 pt-6 text-sm">
          <input
            type="checkbox"
            checked={diarize}
            onChange={(event) => {
              const checked = event.target.checked;
              setDiarize(checked);
              if (checked && !tierFeatures[tier].speakerLabels) {
                setTier("premium");
                setNotice("Speaker labels require Premium, so the selected quality and price changed to Premium.");
              } else setNotice(null);
            }}
            disabled={!tierFeatures.standard.speakerLabels && !tierFeatures.premium.speakerLabels}
          />
          <span><span className="font-medium"><T id="newJob.recognizeSpeakers" /></span><span className="block text-muted">{tierFeatures.premium.speakerLabels ? "Automatic labels can be wrong and can be renamed in the finished transcript." : "Speaker labels are not currently available."}</span></span>
        </label>
      </div>

      {notice && <p role="status" className="status-info mt-4">{notice}</p>}

      <details className="mt-6 max-w-3xl border-y border-line py-3 text-sm">
        <summary className="cursor-pointer font-medium">How AI handles this audio</summary>
        <div className="mt-3 space-y-2 text-muted">
          <p>The selected audio is sent to {providerRoutes[tier].provider} and processed with {providerRoutes[tier].model} to create an automatic transcript.</p>
          <p>Review names, numbers, speaker labels, and important quotations. You can correct the finished transcript before exporting or sharing it.</p>
          <p>The source upload is removed after processing. Playable audio is retained for {audioRetentionDays === 0 ? "no additional time" : `${audioRetentionDays} day${audioRetentionDays === 1 ? "" : "s"}`}; transcripts remain until you delete them or your account.</p>
          <p><a href="/privacy" className="text-link">Read the full data and privacy explanation</a>.</p>
        </div>
      </details>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <button type="submit" disabled={Boolean(busy) || !emailVerified} className="button-primary sm:min-w-48">
          {busy ?? (mode === "url" && !wholePlaylist ? "Check duration and price" : <T id="newJob.submit" />)}
        </button>
        <output className="text-sm text-muted" aria-live="polite">
          {estimatedMinutes && estimate !== null ? (
            subscriptionCoversTier && backupCredits === 0 ? (
              `Included in your plan · ${subscriptionMinutesLeft} minutes remain before this job`
            ) : subscriptionCoversTier && planMinutes > 0 ? (
              `Plan covers ${planMinutes} min; ${backupCredits} backup credits cover the remainder`
            ) : (
              `${estimate} credits (about $${((estimate * usdCentsPerCredit) / 100).toFixed(2)} USD) · ${estimatedMinutes} min`
            )
          ) : mode === "url" && url.trim() && !wholePlaylist ? (
            "Duration and price will be shown on the next screen before transcription starts."
          ) : null}
        </output>
      </div>

      {error && <p role="alert" className="status-error mt-4">{error}</p>}
      {queued && <p role="status" className="status-success mt-4"><T id="newJob.queued" /></p>}
    </form>
  );
}
