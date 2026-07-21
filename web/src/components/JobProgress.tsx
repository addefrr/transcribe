"use client";

import { useEffect, useState } from "react";
import { formatEta, jobProgress, STAGES } from "@/lib/progress";
import type { Job } from "@/lib/schema";

// Renders the pipeline stepper, an estimated progress bar, and a live ETA that
// ticks between server polls. Shown only while a job is active.
export default function JobProgress({ job }: { job: Job }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const p = jobProgress(job, now);
  if (!p.active) return null;

  const eta = formatEta(p.etaSeconds);

  return (
    <div className="mt-6 rounded-xl border border-line p-5">
      {/* Stepper */}
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        {STAGES.map((s, i) => {
          const state = i < p.stageIndex ? "done" : i === p.stageIndex ? "current" : "todo";
          return (
            <li key={s.key} className="flex items-center gap-2">
              <span
                className={`grid h-5 w-5 place-items-center rounded-full text-[10px] ${
                  state === "done"
                    ? "bg-brand text-brand-ink"
                    : state === "current"
                      ? "bg-brand/15 text-brand ring-1 ring-brand"
                      : "bg-paper-2 text-muted"
                }`}
              >
                {state === "done" ? "✓" : i + 1}
              </span>
              <span className={state === "todo" ? "text-muted" : "text-ink"}>{s.label}</span>
              {i < STAGES.length - 1 && <span className="mx-1 text-line">—</span>}
            </li>
          );
        })}
      </ol>

      {/* Progress bar */}
      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-paper-2">
        <div
          className="h-full rounded-full bg-brand transition-[width] duration-1000 ease-linear"
          style={{ width: `${Math.round(p.fraction * 100)}%` }}
        />
      </div>
      <p className="mt-2 text-sm text-muted">
        {STAGES[p.stageIndex]?.label}
        {eta ? ` · ${eta}` : ""} · this page updates on its own
      </p>
    </div>
  );
}
