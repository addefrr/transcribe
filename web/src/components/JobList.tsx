"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  DEFAULT_FOLDER_COLOR,
  FOLDER_COLOR_KEYS,
  FOLDER_COLORS,
  folderDot,
  type FolderColor,
  MAX_FOLDER_NAME,
} from "@/lib/folders";
import { jobProgress } from "@/lib/progress";
import type { Folder, Job } from "@/lib/schema";
import StatusBadge from "./StatusBadge";

// null = show all; "none" = only unfiled; otherwise a folder id.
type Filter = null | "none" | string;

function ColorSwatches({
  value,
  onChange,
}: {
  value: FolderColor;
  onChange: (c: FolderColor) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {FOLDER_COLOR_KEYS.map((c) => (
        <button
          key={c}
          type="button"
          title={FOLDER_COLORS[c].label}
          onClick={() => onChange(c)}
          className={`h-5 w-5 rounded-full ${FOLDER_COLORS[c].dot} ${
            value === c ? "ring-2 ring-offset-2 ring-offset-paper ring-ink" : ""
          }`}
        />
      ))}
    </div>
  );
}

export default function JobList() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [filter, setFilter] = useState<Filter>(null);

  // New-folder form
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<FolderColor>(DEFAULT_FOLDER_COLOR);

  // Editing the active folder
  const [editing, setEditing] = useState(false);

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

  useEffect(() => {
    fetch("/api/folders")
      .then((r) => (r.ok ? r.json() : { folders: [] }))
      .then((d) => setFolders(d.folders))
      .catch(() => {});
  }, []);

  async function createFolder() {
    const name = newName.trim();
    if (!name) return;
    const res = await fetch("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, color: newColor }),
    });
    if (res.ok) {
      const { folder } = await res.json();
      setFolders((f) => [...f, folder]);
      setNewName("");
      setNewColor(DEFAULT_FOLDER_COLOR);
      setCreating(false);
      setFilter(folder.id);
    }
  }

  async function patchFolder(id: string, patch: { name?: string; color?: FolderColor }) {
    const res = await fetch(`/api/folders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const { folder } = await res.json();
      setFolders((f) => f.map((x) => (x.id === id ? folder : x)));
    }
  }

  async function deleteFolder(id: string) {
    const res = await fetch(`/api/folders/${id}`, { method: "DELETE" });
    if (res.ok) {
      setFolders((f) => f.filter((x) => x.id !== id));
      setJobs((js) =>
        js ? js.map((j) => (j.folderId === id ? { ...j, folderId: null } : j)) : js,
      );
      setFilter(null);
      setEditing(false);
    }
  }

  async function assignFolder(jobId: string, folderId: string | null) {
    // Optimistic — the 3s poll will reconcile if the request fails.
    setJobs((js) => (js ? js.map((j) => (j.id === jobId ? { ...j, folderId } : j)) : js));
    await fetch(`/api/jobs/${jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderId }),
    }).catch(() => {});
  }

  if (jobs === null) {
    return <p className="mt-8 text-sm text-muted">Loading…</p>;
  }

  const counts = new Map<string, number>();
  let unfiled = 0;
  for (const j of jobs) {
    if (j.folderId) counts.set(j.folderId, (counts.get(j.folderId) ?? 0) + 1);
    else unfiled += 1;
  }

  const visible =
    filter === null
      ? jobs
      : filter === "none"
        ? jobs.filter((j) => !j.folderId)
        : jobs.filter((j) => j.folderId === filter);

  const activeFolder = typeof filter === "string" && filter !== "none"
    ? folders.find((f) => f.id === filter)
    : undefined;

  const chip = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${
      active ? "border-ink bg-paper-2 font-medium" : "border-line text-muted hover:border-ink"
    }`;

  return (
    <div className="mt-8">
      {/* Folder toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setFilter(null)} className={chip(filter === null)}>
          All
          <span className="text-muted">{jobs.length}</span>
        </button>
        {folders.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => {
              setFilter(f.id);
              setEditing(false);
            }}
            className={chip(filter === f.id)}
          >
            <span className={`h-2.5 w-2.5 rounded-full ${folderDot(f.color)}`} />
            {f.name}
            <span className="text-muted">{counts.get(f.id) ?? 0}</span>
          </button>
        ))}
        {folders.length > 0 && unfiled > 0 && (
          <button
            type="button"
            onClick={() => setFilter("none")}
            className={chip(filter === "none")}
          >
            Unfiled
            <span className="text-muted">{unfiled}</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          className="rounded-full border border-dashed border-line px-3 py-1 text-sm text-muted hover:border-ink hover:text-ink"
        >
          + New folder
        </button>
      </div>

      {/* New-folder form */}
      {creating && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-line p-4">
          <input
            autoFocus
            value={newName}
            maxLength={MAX_FOLDER_NAME}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createFolder()}
            placeholder="Folder name"
            className="w-48 rounded-md border border-line bg-transparent px-3 py-1.5 text-sm outline-none focus:border-brand"
          />
          <ColorSwatches value={newColor} onChange={setNewColor} />
          <button
            type="button"
            onClick={createFolder}
            disabled={!newName.trim()}
            className="rounded-md bg-brand px-4 py-1.5 text-sm font-medium text-brand-ink hover:opacity-90 disabled:opacity-40"
          >
            Create
          </button>
          <button
            type="button"
            onClick={() => setCreating(false)}
            className="text-sm text-muted hover:text-ink"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Edit active folder */}
      {activeFolder && (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          {editing ? (
            <>
              <input
                defaultValue={activeFolder.name}
                maxLength={MAX_FOLDER_NAME}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    patchFolder(activeFolder.id, { name: e.currentTarget.value.trim() });
                    setEditing(false);
                  }
                }}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== activeFolder.name) patchFolder(activeFolder.id, { name: v });
                }}
                className="w-44 rounded-md border border-line bg-transparent px-3 py-1.5 outline-none focus:border-brand"
              />
              <ColorSwatches
                value={activeFolder.color as FolderColor}
                onChange={(c) => patchFolder(activeFolder.id, { color: c })}
              />
              <button
                type="button"
                onClick={() => deleteFolder(activeFolder.id)}
                className="text-red-600 hover:underline dark:text-red-400"
              >
                Delete folder
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="text-muted hover:text-ink"
              >
                Done
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-muted hover:text-ink"
            >
              Edit “{activeFolder.name}”
            </button>
          )}
        </div>
      )}

      {/* Job table */}
      {visible.length === 0 ? (
        <p className="mt-8 text-sm text-muted">
          {jobs.length === 0
            ? "Nothing here yet — add a file or link above to create your first transcript."
            : "No transcripts in this folder yet."}
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr>
                <th className="py-2 pr-4 font-medium">Recording</th>
                <th className="py-2 pr-4 font-medium">Folder</th>
                <th className="py-2 pr-4 font-medium">Quality</th>
                <th className="py-2 pr-4 font-medium">Length</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((job) => (
                <tr key={job.id} className="border-b border-line">
                  <td
                    className="max-w-60 truncate py-2.5 pr-4"
                    title={job.outputName ?? job.sourceUrl ?? job.originalFilename ?? ""}
                  >
                    {job.outputName ??
                      (job.sourceType === "url"
                        ? job.sourceUrl
                        : (job.originalFilename ?? "upload"))}
                  </td>
                  <td className="py-2.5 pr-4">
                    <div className="inline-flex items-center gap-1.5">
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${
                          job.folderId
                            ? folderDot(
                                folders.find((f) => f.id === job.folderId)?.color ??
                                  DEFAULT_FOLDER_COLOR,
                              )
                            : "bg-transparent ring-1 ring-line"
                        }`}
                      />
                      <select
                        aria-label="Folder"
                        value={job.folderId ?? ""}
                        onChange={(e) => assignFolder(job.id, e.target.value || null)}
                        className="max-w-32 cursor-pointer truncate rounded-md border border-transparent bg-transparent py-0.5 pl-1 pr-5 text-sm text-muted outline-none hover:border-line focus:border-brand"
                      >
                        <option value="">No folder</option>
                        {folders.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>
                  <td className="py-2.5 pr-4 capitalize">{job.tier}</td>
                  <td className="py-2.5 pr-4">
                    {job.durationSeconds ? `${Math.ceil(job.durationSeconds / 60)} min` : "—"}
                  </td>
                  <td className="py-2.5 pr-4">
                    <StatusBadge status={job.status} />
                    {(() => {
                      const p = jobProgress(job);
                      return p.active ? (
                        <div className="mt-1 h-1 w-20 overflow-hidden rounded-full bg-paper-2">
                          <div
                            className="h-full rounded-full bg-brand transition-[width] duration-500"
                            style={{ width: `${Math.round(p.fraction * 100)}%` }}
                          />
                        </div>
                      ) : null;
                    })()}
                  </td>
                  <td className="py-2.5">
                    <Link href={`/jobs/${job.id}`} className="text-brand hover:underline">
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
