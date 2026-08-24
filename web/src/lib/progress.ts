// Client-safe descriptions of the states persisted by the worker. Providers do
// not expose a reliable completion percentage or ETA, so the UI reports only
// the latest confirmed stage.

export const STAGES = [
  { key: "pending", label: "Queued" },
  { key: "probing", label: "Checking media" },
  { key: "downloading", label: "Preparing media" },
  { key: "transcribing", label: "Transcribing" },
  { key: "completed", label: "Ready" },
] as const;

export type StageKey = (typeof STAGES)[number]["key"];
export type StatusTone = "neutral" | "attention" | "working" | "success" | "danger";

export type JobProgress = {
  status: string;
  label: string;
  description: string;
  stage: StageKey | null;
  active: boolean;
  tone: StatusTone;
};

const KNOWN: Record<string, Omit<JobProgress, "status">> = {
  pending: {
    label: "Queued",
    description: "Waiting for a worker to claim this transcription.",
    stage: "pending",
    active: true,
    tone: "neutral",
  },
  probing: {
    label: "Checking media",
    description: "Checking the source and recording length before processing continues.",
    stage: "probing",
    active: true,
    tone: "attention",
  },
  awaiting_confirmation: {
    label: "Confirmation needed",
    description: "The duration check is complete. Review the charge and confirm to continue.",
    stage: null,
    active: false,
    tone: "attention",
  },
  downloading: {
    label: "Preparing media",
    description: "Fetching or preparing the media for speech recognition.",
    stage: "downloading",
    active: true,
    tone: "working",
  },
  transcribing: {
    label: "Transcribing",
    description:
      "The speech-to-text provider is processing the audio. It does not report a reliable percentage or finish time.",
    stage: "transcribing",
    active: true,
    tone: "working",
  },
  completed: {
    label: "Ready",
    description: "The transcript is ready to review.",
    stage: "completed",
    active: false,
    tone: "success",
  },
  failed: {
    label: "Failed",
    description: "Processing stopped before a transcript was completed.",
    stage: null,
    active: false,
    tone: "danger",
  },
};

function humanizeStatus(status: string): string {
  const words = status.replace(/[_-]+/g, " ").trim();
  if (!words) return "Unknown status";
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function jobProgress(job: { status: string }): JobProgress {
  const known = KNOWN[job.status];
  if (!known) {
    return {
      status: job.status,
      label: humanizeStatus(job.status),
      description: "The service reported a processing state this page does not recognize yet.",
      stage: null,
      active: false,
      tone: "neutral",
    };
  }

  return {
    status: job.status,
    ...known,
  };
}
