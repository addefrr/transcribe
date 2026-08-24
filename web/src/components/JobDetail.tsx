"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { CustomerJob } from "@/lib/job-dto";
import type { TierFeatures } from "@/lib/pricing";
import type { TranscriptSegment } from "@/lib/schema";
import JobProgress from "./JobProgress";
import StatusBadge from "./StatusBadge";
import { T } from "./T";

type Confirmation = {
  minutes: number;
  planMinutes: number;
  backupCredits: number;
  creditBalance: number;
} | null;

type TranscriptPayload = {
  text: string;
  segments: TranscriptSegment[];
  createdAt?: string;
  updatedAt?: string;
};

type Payload = {
  job: CustomerJob;
  transcript: TranscriptPayload | null;
  features: TierFeatures;
  confirmation: Confirmation;
};

const ACTIVE = new Set(["pending", "probing", "downloading", "transcribing"]);

function fmt(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
    : `${minutes}:${String(secs).padStart(2, "0")}`;
}

export default function JobDetail({ id }: { id: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [shareId, setShareId] = useState<string | null | undefined>(undefined);
  const [sharing, setSharing] = useState(false);
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const [shareFailed, setShareFailed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmationError, setConfirmationError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<TranscriptSegment[]>([]);
  const [speakerNames, setSpeakerNames] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [editStatus, setEditStatus] = useState<string | null>(null);
  const [editFailed, setEditFailed] = useState(false);
  const [undoRevision, setUndoRevision] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [pollGeneration, setPollGeneration] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const router = useRouter();

  function seek(seconds: number) {
    const element = audioRef.current;
    if (!element) return;
    element.currentTime = seconds;
    element.play().catch(() => {});
  }

  async function load() {
    try {
      const response = await fetch(`/api/jobs/${id}`, { cache: "no-store" });
      if (response.status === 404) {
        setNotFound(true);
        return "not-found" as const;
      }
      if (!response.ok) throw new Error("The transcription could not be loaded.");
      const payload: Payload = await response.json();
      setData(payload);
      setLoadError(null);
      setShareId((current) => (current === undefined ? payload.job.shareId : current));
      return payload;
    } catch {
      setLoadError("The transcription could not be loaded. Check your connection and try again.");
      return null;
    }
  }

  useEffect(() => {
    let stopped = false;
    let running = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      if (running || stopped) return;
      running = true;
      const payload = await load();
      running = false;
      if (stopped || payload === "not-found") return;
      if (payload === null || ACTIVE.has(payload.job.status)) {
        timer = setTimeout(poll, document.hidden ? 15_000 : payload ? 2_000 : 5_000);
      }
    }
    const onVisibility = () => {
      if (!document.hidden) {
        if (timer) clearTimeout(timer);
        void poll();
      }
    };
    void poll();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, pollGeneration]);

  async function confirmJob() {
    setConfirming(true);
    setConfirmationError(null);
    try {
      const response = await fetch(`/api/jobs/${id}/confirm`, { method: "POST" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "The job could not be started.");
      // Polling intentionally stops while a URL job waits for confirmation.
      // Restart the effect now that the job has returned to the active queue.
      setPollGeneration((generation) => generation + 1);
    } catch (caught) {
      setConfirmationError(caught instanceof Error ? caught.message : "The job could not be started.");
    } finally {
      setConfirming(false);
    }
  }

  async function enableShare() {
    setSharing(true);
    setShareStatus(null);
    setShareFailed(false);
    try {
      const response = await fetch(`/api/jobs/${id}/share`, { method: "POST" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "A share link could not be created.");
      setShareId(result.shareId);
      setShareStatus("Public link created. Anyone with the link can now read the transcript.");
    } catch (caught) {
      setShareFailed(true);
      setShareStatus(caught instanceof Error ? caught.message : "A share link could not be created.");
    } finally {
      setSharing(false);
    }
  }

  async function disableShare() {
    if (!window.confirm("Stop sharing now? The current public link will stop working immediately.")) return;
    setSharing(true);
    setShareStatus(null);
    setShareFailed(false);
    try {
      const response = await fetch(`/api/jobs/${id}/share`, { method: "DELETE" });
      if (!response.ok) throw new Error("Sharing could not be stopped.");
      setShareId(null);
      setShareStatus("Sharing stopped. The previous link no longer works.");
    } catch (caught) {
      setShareFailed(true);
      setShareStatus(caught instanceof Error ? caught.message : "Sharing could not be stopped.");
    } finally {
      setSharing(false);
    }
  }

  const shareUrl = shareId && typeof window !== "undefined"
    ? `${window.location.origin}/share/${shareId}`
    : "";

  async function copyShare() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareFailed(false);
      setShareStatus("Share link copied to the clipboard.");
    } catch {
      setShareFailed(true);
      setShareStatus("Clipboard access was blocked. Select and copy the link field instead.");
    }
  }

  function beginEditing(transcript: TranscriptPayload) {
    setDraft(transcript.segments.map((segment) => ({ ...segment })));
    setSpeakerNames(Object.fromEntries(
      [...new Set(transcript.segments.map((segment) => segment.speaker).filter(Boolean) as string[])]
        .map((speaker) => [speaker, speaker]),
    ));
    setEditStatus(null);
    setEditFailed(false);
    setUndoRevision(null);
    setEditing(true);
  }

  async function saveEdits() {
    setSaving(true);
    setEditStatus(null);
    setEditFailed(false);
    try {
      const segments = draft.map((segment) => ({
        ...segment,
        text: segment.text.trim(),
        ...(segment.speaker
          ? { speaker: speakerNames[segment.speaker]?.trim() || segment.speaker }
          : {}),
      }));
      const response = await fetch(`/api/jobs/${id}/transcript`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ segments }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Changes could not be saved.");
      setData((current) => current ? { ...current, transcript: result.transcript } : current);
      setUndoRevision(result.revisionId);
      setEditing(false);
      setEditStatus("Changes saved. Downloads and the public share now use the corrected text.");
    } catch (caught) {
      setEditFailed(true);
      setEditStatus(caught instanceof Error ? caught.message : "Changes could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function undoEdit() {
    if (!undoRevision) return;
    try {
      const response = await fetch(`/api/jobs/${id}/transcript`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ revisionId: undoRevision }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "The previous version could not be restored.");
      setData((current) => current ? { ...current, transcript: result.transcript } : current);
      setUndoRevision(null);
      setEditFailed(false);
      setEditStatus("Previous transcript version restored.");
    } catch (caught) {
      setEditFailed(true);
      setEditStatus(caught instanceof Error ? caught.message : "The previous version could not be restored.");
    }
  }

  async function deleteJob() {
    if (!window.confirm("Permanently delete this transcript, its public link, and retained audio?")) return;
    setDeleting(true);
    setLoadError(null);
    try {
      const response = await fetch(`/api/jobs/${id}`, { method: "DELETE" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "The transcript could not be deleted.");
      router.push("/dashboard");
      router.refresh();
    } catch (caught) {
      setLoadError(caught instanceof Error ? caught.message : "The transcript could not be deleted.");
      setDeleting(false);
    }
  }

  if (notFound) {
    return <div className="status-info"><T id="jobDetail.notFound" /> <Link href="/dashboard" className="text-link">Return to my transcriptions</Link>.</div>;
  }
  if (!data) {
    return (
      <div
        role={loadError ? "alert" : "status"}
        className={loadError ? "status-error" : "text-sm text-muted"}
      >
        {loadError ?? "Loading transcription…"}
        {loadError && <button type="button" onClick={() => void load()} className="text-link ml-2 inline-flex min-h-11 items-center">Try again</button>}
      </div>
    );
  }

  const { job, transcript, features, confirmation } = data;
  const source = job.outputName ?? (job.sourceType === "url" ? job.sourceUrl : job.originalFilename) ?? "Uploaded file";
  const paymentParts = [] as string[];
  if (job.subscriptionMinutesCharged > 0) paymentParts.push(`${job.subscriptionMinutesCharged} plan min used`);
  if (job.subscriptionMinutesHeld > 0 && job.status !== "completed") paymentParts.push(`${job.subscriptionMinutesHeld} plan min reserved`);
  if (job.creditsCharged > 0) paymentParts.push(`${job.creditsCharged} backup credits used`);
  if (job.creditsHeld > 0 && job.status !== "completed") paymentParts.push(`${job.creditsHeld} credits reserved`);

  return (
    <div>
      <Link href="/dashboard" className="text-link inline-flex min-h-11 items-center text-sm"><T id="jobDetail.back" /></Link>
      <header className="mt-5 max-w-4xl">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="min-w-0 break-words text-2xl font-semibold tracking-tight">{source}</h1>
          <StatusBadge status={job.status} />
        </div>
        <p className="mt-2 text-sm text-muted">
          <span className="capitalize">{job.tier}</span>
          {job.durationSeconds ? ` · ${fmt(job.durationSeconds)}` : ""}
          {job.language ? ` · ${job.language}` : ""}
          {paymentParts.length ? ` · ${paymentParts.join(" · ")}` : ""}
        </p>
      </header>

      {job.status === "awaiting_confirmation" && confirmation && (
        <section aria-labelledby="confirm-heading" className="mt-8 max-w-3xl border-y border-line py-6">
          <p className="eyebrow">Duration checked · no transcription charge yet</p>
          <h2 id="confirm-heading" className="section-title">Confirm before transcription starts</h2>
          <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-[11rem_1fr]">
            <dt className="text-muted">Recording length</dt><dd>{confirmation.minutes} started minutes</dd>
            <dt className="text-muted">Selected processing</dt><dd className="capitalize">{job.tier}{job.diarize ? " with speaker labels" : ""}</dd>
            {confirmation.planMinutes > 0 && <><dt className="text-muted">Plan allowance</dt><dd>{confirmation.planMinutes} minutes</dd></>}
            <dt className="text-muted">Backup credits</dt>
            <dd>{confirmation.backupCredits > 0 ? `${confirmation.backupCredits} credits from your ${confirmation.creditBalance}-credit balance` : "None — fully covered by the plan"}</dd>
          </dl>
          {confirmation.backupCredits > confirmation.creditBalance && (
            <p className="status-warning mt-5">You have {confirmation.creditBalance} backup credits. <Link href="/credits" className="text-link">Add credits before confirming</Link>.</p>
          )}
          {confirmationError && <p role="alert" className="status-error mt-5">{confirmationError}</p>}
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={confirmJob}
              disabled={confirming || confirmation.backupCredits > confirmation.creditBalance}
              className="button-primary"
            >
              {confirming ? "Starting transcription…" : "Confirm and start transcription"}
            </button>
            <button type="button" onClick={deleteJob} disabled={deleting} className="button-secondary">
              {deleting ? "Removing…" : "Cancel and remove"}
            </button>
          </div>
        </section>
      )}

      {job.status === "failed" && (
        <div className="status-error mt-7 max-w-3xl" role="alert">
          <p className="font-semibold"><T id="jobDetail.failed" /></p>
          {job.error && <p className="mt-1">{job.error}</p>}
          <p className="mt-2">
            {job.sourceType === "url"
              ? "Return to the dashboard and submit the link again after checking it is public and still available."
              : "The source upload was removed, so choose the file again to retry."}
          </p>
          <Link href="/dashboard" className="mt-2 inline-flex min-h-11 items-center font-semibold underline">Start again</Link>
        </div>
      )}

      {ACTIVE.has(job.status) && <JobProgress job={job} />}

      {job.status === "completed" && transcript && (
        <>
          <section aria-labelledby="ai-result" className="mt-7 max-w-3xl border-y border-line py-4 text-sm">
            <h2 id="ai-result" className="font-semibold">Automatic transcript — review before relying on it</h2>
            <p className="mt-1 text-muted">
              {job.resultSource === "same-account-cache" ? "Reused from this account's earlier transcript" : `Created by ${job.provider ?? "the configured provider"}${job.model ? ` with ${job.model}` : ""}`}.
              {" "}Check names, numbers, speaker labels, and important quotations against the recording.
            </p>
          </section>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            {(features.textExport || features.subtitleExport) && (
              ([
                ["txt", "jobDetail.downloadTxt"],
                ["srt", "jobDetail.downloadSrt"],
                ["vtt", "jobDetail.downloadVtt"],
              ] as const)
                .filter(([format]) => format === "txt" ? features.textExport : features.subtitleExport)
                .map(([format, label]) => (
                  <a key={format} href={`/api/jobs/${job.id}/download?format=${format}`} className="button-secondary">
                    <span aria-hidden="true">↓</span> <T id={label} />
                  </a>
                ))
            )}
            {!editing && (
              <button type="button" onClick={() => beginEditing(transcript)} className="button-secondary">Edit transcript</button>
            )}
          </div>

          {editStatus && (
            <p role={editFailed ? "alert" : "status"} className={`${editFailed ? "status-error" : "status-success"} mt-4 max-w-3xl`}>
              {editStatus}
              {undoRevision && <button type="button" onClick={undoEdit} className="ml-2 inline-flex min-h-11 items-center font-semibold underline">Undo this edit</button>}
            </p>
          )}

          {features.publicSharing && (
            <section aria-labelledby="share-heading" className="mt-7 max-w-3xl border-y border-line py-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 id="share-heading" className="font-semibold"><T id="jobDetail.shareHeading" /></h2>
                  <p className="mt-1 text-sm text-muted">{shareId ? <T id="jobDetail.shareOnBody" /> : <T id="jobDetail.shareOffBody" />}</p>
                </div>
                <button type="button" onClick={shareId ? disableShare : enableShare} disabled={sharing} className={shareId ? "button-secondary" : "button-primary"}>
                  {sharing ? "Updating sharing…" : shareId ? <T id="jobDetail.shareStop" /> : <T id="jobDetail.shareCreate" />}
                </button>
              </div>
              {shareId && (
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <label className="min-w-0 flex-1">
                    <span className="sr-only">Public transcript link</span>
                    <input readOnly value={shareUrl} onFocus={(event) => event.currentTarget.select()} className="field-input w-full font-mono text-sm" />
                  </label>
                  <button type="button" onClick={copyShare} className="button-secondary"><T id="jobDetail.shareCopy" /></button>
                  <a href={shareUrl} target="_blank" rel="noreferrer" className="button-secondary"><T id="jobDetail.shareOpen" /><span className="sr-only"> in a new tab</span></a>
                </div>
              )}
              {shareStatus && (
                <p
                  role={shareFailed ? "alert" : "status"}
                  className={`${shareFailed ? "status-error" : "status-success"} mt-3`}
                >
                  {shareStatus}
                </p>
              )}
            </section>
          )}

          {features.audioPlayback && job.audioKey && (
            <div className="mt-7 max-w-3xl">
              <p id="transcript-audio-label" className="field-label">
                Source audio retained for review
              </p>
              <audio
                aria-labelledby="transcript-audio-label"
                ref={audioRef}
                controls
                preload="none"
                src={`/api/jobs/${job.id}/audio`}
                className="mt-2 w-full"
              />
            </div>
          )}

          {editing ? (
            <section aria-labelledby="edit-heading" className="mt-7 max-w-3xl">
              <h2 id="edit-heading" className="section-title">Correct transcript</h2>
              <p className="mt-2 text-sm text-muted">Timestamps stay fixed. Saved text updates exports and any public share. The previous version is kept so this edit can be undone.</p>
              {Object.keys(speakerNames).length > 0 && (
                <fieldset className="mt-5 grid gap-3 sm:grid-cols-2">
                  <legend className="field-label col-span-full">Rename speaker labels</legend>
                  {Object.entries(speakerNames).map(([original, value]) => (
                    <label key={original} className="text-sm"><span className="text-muted">{original}</span><input value={value} onChange={(event) => setSpeakerNames((current) => ({ ...current, [original]: event.target.value }))} className="field-input mt-1 w-full" maxLength={80} /></label>
                  ))}
                </fieldset>
              )}
              <ol className="mt-5 space-y-4">
                {draft.map((segment, index) => (
                  <li key={`${segment.start}-${index}`} className="grid gap-2 sm:grid-cols-[5rem_1fr]">
                    <span className="pt-2 font-mono text-sm text-muted">{fmt(segment.start)}</span>
                    <label><span className="sr-only">Transcript text at {fmt(segment.start)}</span><textarea value={segment.text} onChange={(event) => setDraft((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, text: event.target.value } : item))} rows={2} className="field-input w-full resize-y leading-7" /></label>
                  </li>
                ))}
              </ol>
              <div className="mt-6 flex flex-wrap gap-3">
                <button type="button" onClick={saveEdits} disabled={saving} className="button-primary">{saving ? "Saving changes…" : "Save transcript changes"}</button>
                <button type="button" onClick={() => { setEditing(false); setEditStatus(null); setEditFailed(false); }} disabled={saving} className="button-secondary">Discard changes</button>
              </div>
            </section>
          ) : (
            <article aria-label="Transcript" className="mt-7 max-w-3xl">
              <ol className="space-y-5">
                {transcript.segments.map((segment, index) => {
                  const showSpeaker = segment.speaker && segment.speaker !== transcript.segments[index - 1]?.speaker;
                  const canSeek = features.audioPlayback && Boolean(job.audioKey);
                  return (
                    <li key={`${segment.start}-${index}`} className="grid gap-1 sm:grid-cols-[5rem_1fr] sm:gap-4">
                      {canSeek ? (
                        <button
                          type="button"
                          onClick={() => seek(segment.start)}
                          aria-label={`Play transcript from ${fmt(segment.start)}`}
                          className="h-fit min-h-11 text-left font-mono text-sm text-brand underline decoration-transparent hover:decoration-current"
                        >
                          {fmt(segment.start)}
                        </button>
                      ) : (
                        <span className="pt-1 font-mono text-sm text-muted">{fmt(segment.start)}</span>
                      )}
                      <div>
                        {showSpeaker && <p className="mb-1 text-sm font-semibold text-brand">{segment.speaker}</p>}
                        <p className="text-base leading-7 [overflow-wrap:anywhere]">{segment.text}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </article>
          )}
        </>
      )}

      {!ACTIVE.has(job.status) && job.status !== "awaiting_confirmation" && (
        <section className="mt-12 max-w-3xl border-t border-line pt-6">
          <h2 className="font-semibold">Remove this transcription</h2>
          <p className="mt-1 text-sm text-muted">Deletes the transcript, public link, revision history, and any retained audio.</p>
          <button type="button" onClick={deleteJob} disabled={deleting} className="button-danger mt-4">{deleting ? "Deleting…" : "Delete transcription"}</button>
          {loadError && <p role="alert" className="status-error mt-4">{loadError}</p>}
        </section>
      )}
    </div>
  );
}
