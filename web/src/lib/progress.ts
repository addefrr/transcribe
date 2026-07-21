// Live progress + ETA model for a job. Client-safe (no DB import). We don't get
// fine-grained progress from the ASR providers, so this is an honest estimate:
// the bar advances by pipeline stage and, while transcribing, eases toward (but
// never reaches) 100% based on elapsed time against a rough throughput guess.

export const STAGES = [
  { key: "queued", label: "Queued" },
  { key: "fetching", label: "Fetching media" },
  { key: "transcribing", label: "Transcribing" },
  { key: "done", label: "Ready" },
] as const;

export type StageKey = (typeof STAGES)[number]["key"];

// Managed ASR runs several times faster than realtime; assume ~4x with a floor
// so short clips still show a believable few-second estimate.
function estTranscribeSecs(durationSeconds: number | null | undefined): number {
  const d = durationSeconds && durationSeconds > 0 ? durationSeconds : 60;
  return Math.max(8, d * 0.25);
}

function toMs(t: Date | string | null | undefined): number | null {
  if (!t) return null;
  const ms = typeof t === "string" ? Date.parse(t) : t.getTime();
  return Number.isNaN(ms) ? null : ms;
}

export type JobProgress = {
  stage: StageKey;
  stageIndex: number;
  fraction: number; // 0..1 for the progress bar
  etaSeconds: number | null; // remaining estimate while transcribing
  done: boolean;
  failed: boolean;
  active: boolean;
};

export function jobProgress(
  job: {
    status: string;
    durationSeconds?: number | null;
    claimedAt?: Date | string | null;
  },
  nowMs: number = Date.now(),
): JobProgress {
  const base = (stage: StageKey, fraction: number, etaSeconds: number | null): JobProgress => ({
    stage,
    stageIndex: STAGES.findIndex((s) => s.key === stage),
    fraction,
    etaSeconds,
    done: job.status === "completed",
    failed: job.status === "failed",
    active: ["pending", "probing", "downloading", "transcribing"].includes(job.status),
  });

  switch (job.status) {
    case "pending":
      return base("queued", 0.05, null);
    case "probing":
      return base("fetching", 0.15, null);
    case "downloading":
      return base("fetching", 0.3, null);
    case "transcribing": {
      const est = estTranscribeSecs(job.durationSeconds);
      const claimedMs = toMs(job.claimedAt) ?? nowMs;
      const elapsed = Math.max(0, (nowMs - claimedMs) / 1000);
      const fraction = Math.min(0.95, 0.4 + 0.55 * (elapsed / est));
      const etaSeconds = Math.max(0, Math.ceil(est - elapsed));
      return base("transcribing", fraction, etaSeconds);
    }
    case "completed":
      return base("done", 1, 0);
    case "failed":
      return base("transcribing", 0, null);
    default:
      return base("queued", 0.05, null);
  }
}

export function formatEta(seconds: number | null): string {
  if (seconds === null) return "";
  if (seconds <= 0) return "almost done";
  if (seconds < 60) return `about ${seconds}s left`;
  const m = Math.ceil(seconds / 60);
  return `about ${m} min left`;
}
