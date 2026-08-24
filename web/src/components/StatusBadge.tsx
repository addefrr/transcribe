import { jobProgress, type StatusTone } from "@/lib/progress";

const STYLES: Record<StatusTone, string> = {
  neutral: "bg-paper-2 text-muted",
  attention: "bg-warning-soft text-warning",
  working: "bg-info-soft text-info",
  success: "bg-success-soft text-success",
  danger: "bg-danger-soft text-danger",
};

export default function StatusBadge({ status }: { status: string }) {
  const detail = jobProgress({ status });
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLES[detail.tone]}`}
    >
      <span className="sr-only">Status: </span>
      {detail.label}
    </span>
  );
}
