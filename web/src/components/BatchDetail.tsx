"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { isTier } from "@/lib/pricing";
import type { BatchItem, JobBatch } from "@/lib/schema";

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "Not available";
  const totalMinutes = Math.ceil(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  return minutes === 0 ? `${hours} hr` : `${hours} hr ${minutes} min`;
}

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) return `${minutes} min`;
  return remainder === 0 ? `${hours} hr` : `${hours} hr ${remainder} min`;
}

function itemMinutes(item: BatchItem): number | null {
  return Number.isFinite(item.duration) && Number(item.duration) > 0
    ? Math.max(1, Math.ceil(Number(item.duration) / 60))
    : null;
}

type Props = {
  id: string;
  subscriptionTier: string | null;
  subscriptionMinutesLeft: number;
  subscriptionPeriodLabel: string;
  creditBalance: number;
  maxBatchItems: number;
  maxItemSeconds: number;
  maxBatchSeconds: number;
};

export default function BatchDetail({
  id,
  subscriptionTier: initialSubscriptionTier,
  subscriptionMinutesLeft: initialSubscriptionMinutesLeft,
  subscriptionPeriodLabel: initialSubscriptionPeriodLabel,
  creditBalance: initialCreditBalance,
  maxBatchItems,
  maxItemSeconds,
  maxBatchSeconds,
}: Props) {
  const [batch, setBatch] = useState<JobBatch | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"start" | "discard" | null>(null);
  const [discardArmed, setDiscardArmed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [billing, setBilling] = useState({
    subscriptionTier: initialSubscriptionTier,
    subscriptionMinutesLeft: initialSubscriptionMinutesLeft,
    subscriptionPeriodLabel: initialSubscriptionPeriodLabel,
    creditBalance: initialCreditBalance,
  });
  const errorRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    let stopped = false;
    let nextPoll: ReturnType<typeof setTimeout> | null = null;

    async function load() {
      try {
        const response = await fetch(`/api/batches/${id}`, { cache: "no-store" });
        if (response.status === 404) {
          if (!stopped) setNotFound(true);
          return;
        }
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error ?? "Could not load this playlist.");
        }
        const payload = (await response.json()) as {
          batch: JobBatch;
          billing?: {
            subscriptionTier: string | null;
            subscriptionMinutesLeft: number;
            subscriptionPeriodLabel: string;
            creditBalance: number;
          };
        };
        if (stopped) return;
        setBatch(payload.batch);
        if (payload.billing) setBilling(payload.billing);
        setNotFound(false);
        setLoadError(null);
        if (payload.batch.status === "expanding") {
          nextPoll = setTimeout(load, 2000);
        }
      } catch (error) {
        if (!stopped) {
          setLoadError(error instanceof Error ? error.message : "Could not load this playlist.");
        }
      }
    }

    void load();
    return () => {
      stopped = true;
      if (nextPoll) clearTimeout(nextPoll);
    };
  }, [id, reloadKey]);

  useEffect(() => {
    setBilling({
      subscriptionTier: initialSubscriptionTier,
      subscriptionMinutesLeft: initialSubscriptionMinutesLeft,
      subscriptionPeriodLabel: initialSubscriptionPeriodLabel,
      creditBalance: initialCreditBalance,
    });
  }, [
    initialCreditBalance,
    initialSubscriptionMinutesLeft,
    initialSubscriptionPeriodLabel,
    initialSubscriptionTier,
  ]);

  useEffect(() => {
    if (actionError) errorRef.current?.focus();
  }, [actionError]);

  async function start() {
    setBusy("start");
    setActionError(null);
    try {
      const response = await fetch(`/api/batches/${id}/start`, { method: "POST" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ?? "Could not start the playlist.");
      router.push("/dashboard");
      router.refresh();
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Could not start the playlist. No jobs were started.",
      );
      // The balance or allowance may have changed while the playlist expanded.
      setReloadKey((value) => value + 1);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function discard() {
    setBusy("discard");
    setActionError(null);
    try {
      const response = await fetch(`/api/batches/${id}`, { method: "DELETE" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ?? "Could not discard the playlist.");
      router.push("/dashboard");
      router.refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not discard the playlist.");
      setDiscardArmed(false);
    } finally {
      setBusy(null);
    }
  }

  if (notFound) {
    return (
      <section aria-labelledby="playlist-not-found" className="max-w-xl">
        <h1 id="playlist-not-found" className="text-2xl font-semibold">Playlist not found</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          It may have been discarded, or it does not belong to this account.
        </p>
        <Link href="/dashboard" className="mt-5 inline-block text-sm font-medium text-brand hover:underline">
          Back to my transcriptions
        </Link>
      </section>
    );
  }

  if (!batch) {
    return (
      <section aria-labelledby="playlist-loading" aria-busy={!loadError}>
        <h1 id="playlist-loading" className="text-2xl font-semibold">Playlist review</h1>
        {loadError ? (
          <div className="status-error mt-5 max-w-xl" role="alert">
            <p>{loadError}</p>
            <button
              type="button"
              onClick={() => {
                setLoadError(null);
                setReloadKey((value) => value + 1);
              }}
              className="button-secondary mt-3"
            >
              Try loading again
            </button>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted" role="status" aria-live="polite">
            Loading playlist details…
          </p>
        )}
      </section>
    );
  }

  const items = (batch.items ?? []) as BatchItem[];
  const unpricedItems = items.filter((item) => itemMinutes(item) === null);
  const oversizedItem = items.find(
    (item) => Number.isFinite(item.duration) && Number(item.duration) > maxItemSeconds,
  );
  const totalSeconds = items.reduce(
    (sum, item) => sum + (Number.isFinite(item.duration) ? Math.max(0, Number(item.duration)) : 0),
    0,
  );
  const billableMinutes = items.reduce((sum, item) => sum + (itemMinutes(item) ?? 0), 0);
  const fullyPriced = items.length > 0 && unpricedItems.length === 0;
  const validTier = isTier(batch.tier);
  const validRate = Number.isInteger(batch.creditsPerMinute) && batch.creditsPerMinute > 0;
  const creditsPerMinute = validRate ? batch.creditsPerMinute : 0;
  const planCovers =
    billing.subscriptionTier === "premium" ||
    (billing.subscriptionTier === "standard" && batch.tier === "standard");
  const planMinutes = fullyPriced && planCovers
    ? Math.min(billableMinutes, Math.max(0, billing.subscriptionMinutesLeft))
    : 0;
  const backupMinutes = fullyPriced ? billableMinutes - planMinutes : 0;
  const backupCredits = backupMinutes * creditsPerMinute;
  const totalCredits = billableMinutes * creditsPerMinute;
  const creditShortfall = Math.max(0, backupCredits - billing.creditBalance);
  const itemLimitExceeded = items.length > maxBatchItems;
  const durationLimitExceeded = totalSeconds > maxBatchSeconds;
  const canConfirm =
    batch.status === "ready" &&
    fullyPriced &&
    validTier &&
    validRate &&
    !oversizedItem &&
    !itemLimitExceeded &&
    !durationLimitExceeded &&
    creditShortfall === 0;

  const limitMessage = !validTier
    ? "The saved transcription option is no longer available. Discard this review and submit the playlist again."
    : !validRate
      ? "The saved credit rate is invalid. Discard this review and submit the playlist again."
      : itemLimitExceeded
        ? `This playlist has more than the ${maxBatchItems}-video limit.`
        : oversizedItem
          ? `“${oversizedItem.title || "A playlist item"}” exceeds the ${formatDuration(maxItemSeconds)} per-video limit.`
          : durationLimitExceeded
            ? `This playlist exceeds the ${formatDuration(maxBatchSeconds)} total-audio limit.`
            : null;
  const confirmLabel = !fullyPriced || limitMessage
    ? "Cannot start until the total is confirmed"
    : creditShortfall > 0
      ? `Need ${creditShortfall.toLocaleString()} more credit${creditShortfall === 1 ? "" : "s"}`
      : backupCredits > 0
        ? `Confirm ${items.length} jobs — ${backupCredits.toLocaleString()} credits${planMinutes > 0 ? " after plan allowance" : ""}`
        : `Confirm and start ${items.length} job${items.length === 1 ? "" : "s"} — covered by plan`;

  return (
    <div>
      <Link href="/dashboard" className="text-sm font-medium text-brand hover:underline">
        Back to my transcriptions
      </Link>
      <header className="mt-5">
        <p className="text-sm font-medium text-brand">Review before starting</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Playlist transcription</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
          No transcription provider is called until the item list, duration, plan use, and backup
          credit reservation below are confirmed.
        </p>
      </header>

      {loadError && (
        <div className="status-warning mt-6 max-w-2xl" role="alert">
          <p className="font-semibold">Live status could not be refreshed</p>
          <p className="mt-1">{loadError}</p>
          <button
            type="button"
            onClick={() => {
              setLoadError(null);
              setReloadKey((value) => value + 1);
            }}
            className="button-secondary mt-3"
          >
            Try again
          </button>
        </div>
      )}

      {batch.status === "expanding" && (
        <section className="mt-8 max-w-2xl border-t border-line pt-6" aria-labelledby="playlist-inspecting">
          <h2 id="playlist-inspecting" className="text-lg font-semibold">Inspecting the playlist</h2>
          <p className="mt-2 text-sm leading-6 text-muted" role="status" aria-live="polite">
            Reading titles and durations. This is indeterminate because the source does not report
            reliable progress; no credits or plan minutes have been reserved.
          </p>
          <progress
            aria-label="Inspecting playlist"
            className="mt-4 h-2 w-full max-w-md accent-brand"
          >
            Working
          </progress>
        </section>
      )}

      {batch.status === "failed" && (
        <section className="mt-8 max-w-2xl" aria-labelledby="playlist-failed">
          <div className="status-error" role="alert">
            <h2 id="playlist-failed" className="font-semibold">The playlist could not be read</h2>
            <p className="mt-1 text-sm leading-6">
              {batch.error ?? "The source did not return a usable playlist."} No jobs were started
              and nothing was charged.
            </p>
          </div>
          <p className="mt-4 text-sm leading-6 text-muted">
            Check that the playlist is accessible, or return to the dashboard and submit individual
            video links. You can safely discard this attempt.
          </p>
        </section>
      )}

      {batch.status === "started" && (
        <section className="mt-8 max-w-2xl rounded-lg border border-line bg-paper-2 p-5" aria-labelledby="playlist-started" role="status">
          <h2 id="playlist-started" className="font-semibold">Playlist started</h2>
          <p className="mt-1 text-sm leading-6 text-muted">
            {batch.videoCount} transcription job{batch.videoCount === 1 ? " is" : "s are"} on the
            dashboard. Repeating the start request will not create duplicates.
          </p>
          <Link href="/dashboard" className="mt-3 inline-block text-sm font-medium text-brand hover:underline">
            View transcription jobs
          </Link>
        </section>
      )}

      {batch.status === "ready" && (
        <>
          <section className="mt-8 border-t border-line pt-6" aria-labelledby="playlist-summary">
            <h2 id="playlist-summary" className="text-xl font-semibold">What will be started</h2>
            <dl className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="text-sm text-muted">Videos</dt>
                <dd className="mt-1 font-semibold">{items.length}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted">Source duration</dt>
                <dd className="mt-1 font-semibold">{formatDuration(totalSeconds)}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted">Billable duration</dt>
                <dd className="mt-1 font-semibold">
                  {fullyPriced ? formatMinutes(billableMinutes) : "Cannot calculate"}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted">Option</dt>
                <dd className="mt-1 font-semibold capitalize">
                  {batch.tier}{batch.diarize ? " with speaker labels" : ""}
                </dd>
              </div>
            </dl>
            <p className="mt-4 max-w-2xl text-xs leading-5 text-muted">
              Billing rounds each video up to its next whole minute, so billable duration can be
              higher than the combined source duration. The saved rate is {creditsPerMinute}{" "}
              credit{creditsPerMinute === 1 ? "" : "s"} per video minute. The reservation shown
              here is the maximum; a provider is not called until you confirm it.
            </p>
          </section>

          {items.length === 0 && (
            <div className="status-warning mt-6 max-w-2xl" role="alert">
              <p className="font-semibold">No playable videos were found</p>
              <p className="mt-1 text-sm leading-6">
                No jobs can be started from this review. Discard it, check that the source playlist
                is public and non-empty, then submit it again.
              </p>
            </div>
          )}

          {unpricedItems.length > 0 && (
            <div className="status-warning mt-6 max-w-2xl" role="alert">
              <p className="font-semibold">The total cannot be confirmed</p>
              <p className="mt-1 text-sm leading-6">
                {unpricedItems.length} video{unpricedItems.length === 1 ? " has" : "s have"} no
                reliable duration. No playlist jobs can start without an exact maximum reservation.
                Submit those links individually so each can be inspected before transcription.
              </p>
            </div>
          )}

          {limitMessage && (
            <div className="status-warning mt-6 max-w-2xl" role="alert">
              <p className="font-semibold">
                {!validTier || !validRate ? "Saved options changed" : "Playlist limit reached"}
              </p>
              <p className="mt-1 text-sm leading-6">{limitMessage} No jobs have been started.</p>
            </div>
          )}

          {fullyPriced && !limitMessage && (
            <section className="mt-8 max-w-2xl border-t border-line pt-6" aria-labelledby="playlist-cost">
              <h2 id="playlist-cost" className="text-xl font-semibold">Allowance and credit reservation</h2>
              {planCovers ? (
                <div className="mt-3 space-y-2 text-sm leading-6">
                  <p>
                    Your plan currently has <strong>{formatMinutes(billing.subscriptionMinutesLeft)}</strong>{" "}
                    left {billing.subscriptionPeriodLabel} and will reserve{" "}
                    <strong>{formatMinutes(planMinutes)}</strong> for this playlist.
                  </p>
                  {backupCredits > 0 ? (
                    <p>
                      The remaining {formatMinutes(backupMinutes)} will reserve{" "}
                      <strong>{backupCredits.toLocaleString()} backup credits</strong>. You currently
                      have {billing.creditBalance.toLocaleString()} credits.
                    </p>
                  ) : (
                    <p>No backup credits are expected to be used.</p>
                  )}
                </div>
              ) : (
                <div className="mt-3 space-y-2 text-sm leading-6">
                  <p>
                    This playlist will reserve <strong>{totalCredits.toLocaleString()} credits</strong>.
                    You currently have {billing.creditBalance.toLocaleString()} credits.
                  </p>
                  {billing.subscriptionTier && (
                    <p className="text-muted">
                      Your {billing.subscriptionTier} plan does not cover this {batch.tier} selection.
                    </p>
                  )}
                </div>
              )}
              <p id="playlist-cost-note" className="mt-3 text-xs leading-5 text-muted">
                The server rechecks the balance and remaining allowance atomically when you confirm.
                Unused holds are returned if a video is shorter than reported or its job fails.
              </p>
              {creditShortfall > 0 && (
                <div className="status-error mt-4" role="alert">
                  You need {creditShortfall.toLocaleString()} more credit
                  {creditShortfall === 1 ? "" : "s"} to start every video. No partial playlist will
                  be created. <Link href="/credits" className="font-medium underline">Add backup credits</Link>.
                </div>
              )}
            </section>
          )}

          <div className="mt-7 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={start}
              disabled={!canConfirm || busy !== null}
              aria-describedby={fullyPriced && !limitMessage ? "playlist-cost-note" : undefined}
              className="button-primary"
            >
              {busy === "start" ? "Reserving and starting…" : confirmLabel}
            </button>
            {!canConfirm && creditShortfall === 0 && (
              <p className="max-w-md text-xs leading-5 text-muted">
                Start is unavailable until every duration and limit can be confirmed.
              </p>
            )}
          </div>
        </>
      )}

      {actionError && (
        <div
          ref={errorRef}
          tabIndex={-1}
          className="status-error mt-6 max-w-2xl"
          role="alert"
        >
          <p className="font-semibold">The action could not be completed</p>
          <p className="mt-1">{actionError}</p>
          <button
            type="button"
            onClick={() => {
              router.refresh();
              setReloadKey((value) => value + 1);
            }}
            className="button-secondary mt-3"
          >
            Refresh details
          </button>
        </div>
      )}

      {items.length > 0 && batch.status !== "expanding" && (
        <section className="mt-10 border-t border-line pt-6" aria-labelledby="playlist-items">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 id="playlist-items" className="text-xl font-semibold">Playlist items</h2>
            <p className="text-xs text-muted">{items.length} total</p>
          </div>
          <ol className="mt-4 divide-y divide-line overflow-hidden rounded-lg border border-line">
            {items.map((item, index) => {
              const minutes = itemMinutes(item);
              return (
                <li key={`${item.url}-${index}`} className="grid gap-2 px-4 py-3 text-sm sm:grid-cols-[2rem_minmax(0,1fr)_9rem] sm:items-center">
                  <span className="text-xs tabular-nums text-muted" aria-label={`Item ${index + 1}`}>
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="break-words font-medium">{item.title || "Untitled video"}</p>
                    {!item.title && <p className="mt-1 break-all text-xs text-muted">{item.url}</p>}
                  </div>
                  <p className="text-muted sm:text-right">
                    {minutes === null ? "Duration unavailable" : `${formatDuration(Number(item.duration))} · ${minutes} billable min`}
                  </p>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {batch.status !== "started" && (
        <section className="mt-10 border-t border-line pt-6" aria-labelledby="playlist-discard">
          <h2 id="playlist-discard" className="text-base font-semibold">Do not need this playlist?</h2>
          {!discardArmed ? (
            <button
              type="button"
              onClick={() => setDiscardArmed(true)}
              disabled={busy !== null}
              className="button-secondary mt-3 text-danger hover:border-danger"
            >
              Discard playlist review
            </button>
          ) : (
            <div className="mt-3 max-w-xl rounded-lg border border-line p-4">
              <p className="text-sm leading-6">
                Discard this review? No transcription jobs will be created and no credits or plan
                minutes will be used.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={discard}
                  disabled={busy !== null}
                  className="button-danger"
                >
                  {busy === "discard" ? "Discarding…" : "Confirm discard"}
                </button>
                <button
                  type="button"
                  onClick={() => setDiscardArmed(false)}
                  disabled={busy !== null}
                  className="button-secondary"
                >
                  Keep playlist
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
