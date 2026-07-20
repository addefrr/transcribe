"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Job } from "@/lib/schema";
import StatusBadge from "./StatusBadge";

export default function JobList() {
  const [jobs, setJobs] = useState<Job[] | null>(null);

  useEffect(() => {
    let stop = false;
    async function load() {
      try {
        const res = await fetch("/api/jobs");
        if (res.ok && !stop) setJobs((await res.json()).jobs);
      } catch {
        /* transient network error — next poll will retry */
      }
    }
    load();
    const t = setInterval(load, 3000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, []);

  if (jobs === null) {
    return <p className="mt-8 text-sm text-zinc-500">Loading…</p>;
  }
  if (jobs.length === 0) {
    return (
      <p className="mt-8 text-sm text-zinc-500">
        Nothing here yet — add a file or link above to create your first transcript.
      </p>
    );
  }

  return (
    <div className="mt-8 overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
          <tr>
            <th className="py-2 pr-4 font-medium">Recording</th>
            <th className="py-2 pr-4 font-medium">Quality</th>
            <th className="py-2 pr-4 font-medium">Length</th>
            <th className="py-2 pr-4 font-medium">Cost</th>
            <th className="py-2 pr-4 font-medium">Status</th>
            <th className="py-2 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.id} className="border-b border-zinc-100 dark:border-zinc-900">
              <td
                className="max-w-60 truncate py-2.5 pr-4"
                title={job.outputName ?? job.sourceUrl ?? job.originalFilename ?? ""}
              >
                {job.outputName ??
                  (job.sourceType === "url" ? job.sourceUrl : (job.originalFilename ?? "upload"))}
              </td>
              <td className="py-2.5 pr-4 capitalize">{job.tier}</td>
              <td className="py-2.5 pr-4">
                {job.durationSeconds ? `${Math.ceil(job.durationSeconds / 60)} min` : "—"}
              </td>
              <td className="py-2.5 pr-4">
                {job.status === "completed"
                  ? `${job.creditsCharged} credits`
                  : job.creditsHeld > 0
                    ? `${job.creditsHeld} reserved`
                    : "—"}
              </td>
              <td className="py-2.5 pr-4">
                <StatusBadge status={job.status} />
              </td>
              <td className="py-2.5">
                <Link
                  href={`/jobs/${job.id}`}
                  className="text-indigo-600 hover:underline dark:text-indigo-400"
                >
                  View
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
