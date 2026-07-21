const STYLES: Record<string, string> = {
  pending: "bg-paper-2 text-muted",
  probing: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  downloading: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  transcribing: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  completed: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  failed: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

const LABELS: Record<string, string> = {
  pending: "Queued",
  probing: "Analyzing",
  downloading: "Fetching media",
  transcribing: "Transcribing",
  completed: "Completed",
  failed: "Failed",
};

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLES[status] ?? STYLES.pending}`}
    >
      {LABELS[status] ?? status}
    </span>
  );
}
