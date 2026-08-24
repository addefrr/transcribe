"use client";

import { jobProgress, STAGES } from "@/lib/progress";

// Providers do not expose trustworthy completion percentages or ETAs. This
// component therefore announces only the stage most recently stored by the
// worker and presents the remaining pipeline as orientation, not a forecast.
export default function JobProgress({ job }: { job: { id: string; status: string } }) {
  const progress = jobProgress(job);
  if (!progress.active) return null;

  const headingId = `job-progress-${job.id}`;

  return (
    <section aria-labelledby={headingId} className="mt-6 rounded-xl border border-line p-5">
      <div role="status" aria-live="polite" aria-atomic="true">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Current stage</p>
        <h2 id={headingId} className="mt-1 text-lg font-semibold">
          {progress.label}
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">{progress.description}</p>
      </div>

      <ol aria-label="Processing stages" className="mt-5 grid gap-2 sm:grid-cols-5">
        {STAGES.map((stage) => {
          const current = stage.key === progress.stage;
          return (
            <li
              key={stage.key}
              aria-current={current ? "step" : undefined}
              className={`flex min-h-10 items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                current
                  ? "border-brand bg-brand/10 font-medium text-ink"
                  : "border-line text-muted"
              }`}
            >
              <span
                aria-hidden="true"
                className={`h-2 w-2 shrink-0 rounded-full ${current ? "bg-brand" : "bg-line"}`}
              />
              <span>
                {stage.label}
              </span>
              {current && (
                <span className="ml-auto text-xs font-semibold text-brand">Current</span>
              )}
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-xs text-muted">
        This page updates when the service reports a new stage. Some sources can skip a stage.
      </p>
    </section>
  );
}
