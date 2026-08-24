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
import type { CustomerJob } from "@/lib/job-dto";
import { jobProgress } from "@/lib/progress";
import type { Folder } from "@/lib/schema";
import StatusBadge from "./StatusBadge";

// null = show all; "none" = only unfiled; otherwise a folder id.
type Filter = null | "none" | string;
type Notice = { kind: "status" | "error"; message: string };

const ACTIVE_JOB_STATUSES = new Set(["pending", "probing", "downloading", "transcribing"]);

function jobName(job: CustomerJob): string {
  return (
    job.outputName ??
    (job.sourceType === "url" ? job.sourceUrl : job.originalFilename) ??
    "Uploaded recording"
  );
}

function jobLength(job: CustomerJob): string {
  return job.durationSeconds ? `${Math.ceil(job.durationSeconds / 60)} min` : "Not available";
}

function ColorSwatches({
  value,
  onChange,
  label,
  disabled = false,
}: {
  value: FolderColor;
  onChange: (c: FolderColor) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <fieldset className="flex items-center gap-1">
      <legend className="sr-only">{label}</legend>
      {FOLDER_COLOR_KEYS.map((c) => (
        <button
          key={c}
          type="button"
          title={FOLDER_COLORS[c].label}
          aria-label={`${FOLDER_COLORS[c].label} folder color`}
          aria-pressed={value === c}
          onClick={() => onChange(c)}
          disabled={disabled}
          className="grid h-11 w-11 place-items-center rounded-md disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span
            aria-hidden="true"
            className={`h-5 w-5 rounded-full ${FOLDER_COLORS[c].dot} ${
              value === c ? "ring-2 ring-offset-2 ring-offset-paper ring-ink" : ""
            }`}
          />
        </button>
      ))}
    </fieldset>
  );
}

export default function JobList() {
  const [jobs, setJobs] = useState<CustomerJob[] | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [filter, setFilter] = useState<Filter>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [folderBusy, setFolderBusy] = useState(false);
  const [assigningJobs, setAssigningJobs] = useState<Set<string>>(() => new Set());

  // New-folder form
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<FolderColor>(DEFAULT_FOLDER_COLOR);

  // Editing the active folder
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | null = null;

    function schedule(active: boolean) {
      if (stopped || document.hidden) return;
      timer = setTimeout(load, active ? 3_000 : 10_000);
    }

    async function load() {
      if (stopped || document.hidden || controller) return;
      const request = new AbortController();
      controller = request;
      let active = false;
      try {
        const res = await fetch("/api/jobs", { cache: "no-store", signal: request.signal });
        if (!res.ok) throw new Error("Jobs could not be refreshed.");
        const payload: { jobs: CustomerJob[] } = await res.json();
        active = payload.jobs.some((job) => ACTIVE_JOB_STATUSES.has(job.status));
        if (!stopped) {
          setJobs(payload.jobs);
          setLoadError(null);
        }
      } catch (caught) {
        if (!stopped && !(caught instanceof Error && caught.name === "AbortError")) {
          setLoadError("Transcriptions could not be refreshed. Check your connection and try again.");
        }
      } finally {
        if (controller === request) controller = null;
        schedule(active);
      }
    }

    function onVisibilityChange() {
      if (timer) clearTimeout(timer);
      timer = undefined;
      if (document.hidden) {
        controller?.abort();
      } else {
        void load();
      }
    }

    if (!document.hidden) void load();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      controller?.abort();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [reloadKey]);

  useEffect(() => {
    fetch("/api/folders")
      .then(async (response) => {
        if (!response.ok) throw new Error("Folders could not be loaded.");
        return response.json();
      })
      .then((data: { folders: Folder[] }) => setFolders(data.folders))
      .catch(() =>
        setNotice({ kind: "error", message: "Folders could not be loaded. Transcriptions are still available below." }),
      );
  }, []);

  async function createFolder() {
    const name = newName.trim();
    if (!name || folderBusy) return;
    setFolderBusy(true);
    setNotice({ kind: "status", message: `Creating “${name}”…` });
    try {
      const res = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, color: newColor }),
      });
      const result: { folder?: Folder; error?: string } = await res.json().catch(() => ({}));
      if (!res.ok || !result.folder) {
        throw new Error(result.error ?? "The folder could not be created.");
      }
      const folder = result.folder;
      setFolders((f) => [...f, folder]);
      setNewName("");
      setNewColor(DEFAULT_FOLDER_COLOR);
      setCreating(false);
      setFilter(folder.id);
      setNotice({ kind: "status", message: `Folder “${folder.name}” created.` });
    } catch (caught) {
      setNotice({
        kind: "error",
        message: caught instanceof Error ? caught.message : "The folder could not be created.",
      });
    } finally {
      setFolderBusy(false);
    }
  }

  async function patchFolder(id: string, patch: { name?: string; color?: FolderColor }) {
    if (folderBusy) return;
    setFolderBusy(true);
    setNotice({ kind: "status", message: "Updating folder…" });
    try {
      const res = await fetch(`/api/folders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const result: { folder?: Folder; error?: string } = await res.json().catch(() => ({}));
      if (!res.ok || !result.folder) {
        throw new Error(result.error ?? "The folder could not be updated.");
      }
      const folder = result.folder;
      setFolders((f) => f.map((x) => (x.id === id ? folder : x)));
      setNotice({ kind: "status", message: `Folder “${folder.name}” updated.` });
    } catch (caught) {
      setNotice({
        kind: "error",
        message: caught instanceof Error ? caught.message : "The folder could not be updated.",
      });
    } finally {
      setFolderBusy(false);
    }
  }

  async function deleteFolder(id: string, name: string) {
    if (
      folderBusy ||
      !window.confirm(
        `Delete the folder “${name}”? Its transcriptions will become unfiled; they will not be deleted.`,
      )
    ) {
      return;
    }
    setFolderBusy(true);
    setNotice({ kind: "status", message: `Deleting folder “${name}”…` });
    try {
      const res = await fetch(`/api/folders/${id}`, { method: "DELETE" });
      const result: { error?: string } = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error ?? "The folder could not be deleted.");
      setFolders((f) => f.filter((x) => x.id !== id));
      setJobs((js) =>
        js ? js.map((j) => (j.folderId === id ? { ...j, folderId: null } : j)) : js,
      );
      setFilter(null);
      setEditing(false);
      setNotice({
        kind: "status",
        message: `Folder “${name}” deleted. Its transcriptions are now unfiled.`,
      });
    } catch (caught) {
      setNotice({
        kind: "error",
        message: caught instanceof Error ? caught.message : "The folder could not be deleted.",
      });
    } finally {
      setFolderBusy(false);
    }
  }

  async function assignFolder(jobId: string, folderId: string | null) {
    if (assigningJobs.has(jobId)) return;
    setAssigningJobs((current) => new Set(current).add(jobId));
    setNotice({ kind: "status", message: "Updating transcription folder…" });
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId }),
      });
      const result: { error?: string } = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error ?? "The transcription could not be moved.");
      setJobs((current) =>
        current
          ? current.map((job) => (job.id === jobId ? { ...job, folderId } : job))
          : current,
      );
      const folderName = folderId
        ? folders.find((folder) => folder.id === folderId)?.name ?? "the selected folder"
        : "Unfiled";
      setNotice({ kind: "status", message: `Transcription moved to ${folderName}.` });
    } catch (caught) {
      setNotice({
        kind: "error",
        message: caught instanceof Error ? caught.message : "The transcription could not be moved.",
      });
    } finally {
      setAssigningJobs((current) => {
        const next = new Set(current);
        next.delete(jobId);
        return next;
      });
    }
  }

  if (jobs === null) {
    return loadError ? (
      <div role="alert" className="status-error mt-8">
        {loadError}
        <button
          type="button"
          onClick={() => setReloadKey((key) => key + 1)}
          className="ml-2 font-semibold underline"
        >
          Try again
        </button>
      </div>
    ) : (
      <p role="status" aria-live="polite" className="mt-8 text-sm text-muted">
        Loading transcriptions…
      </p>
    );
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
    `inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 py-2 text-sm ${
      active ? "border-ink bg-paper-2 font-medium" : "border-line text-muted hover:border-ink"
    }`;

  return (
    <div className="mt-8">
      {/* Folder toolbar */}
      <nav aria-label="Filter transcriptions by folder" className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={filter === null}
          aria-label={`Show all transcriptions, ${jobs.length}`}
          onClick={() => {
            setFilter(null);
            setEditing(false);
          }}
          className={chip(filter === null)}
        >
          All
          <span className="text-muted">{jobs.length}</span>
        </button>
        {folders.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filter === f.id}
            aria-label={`Show ${f.name} folder, ${counts.get(f.id) ?? 0} transcriptions`}
            onClick={() => {
              setFilter(f.id);
              setEditing(false);
            }}
            className={chip(filter === f.id)}
          >
            <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${folderDot(f.color)}`} />
            {f.name}
            <span className="text-muted">{counts.get(f.id) ?? 0}</span>
          </button>
        ))}
        {folders.length > 0 && unfiled > 0 && (
          <button
            type="button"
            aria-pressed={filter === "none"}
            aria-label={`Show unfiled transcriptions, ${unfiled}`}
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
          aria-expanded={creating}
          aria-controls="new-folder-form"
          className="min-h-11 rounded-full border border-dashed border-line px-3 py-2 text-sm text-muted hover:border-ink hover:text-ink"
        >
          <span aria-hidden="true">+</span> New folder
        </button>
      </nav>

      {/* New-folder form */}
      {creating && (
        <form
          id="new-folder-form"
          onSubmit={(event) => {
            event.preventDefault();
            void createFolder();
          }}
          className="mt-3 flex flex-wrap items-end gap-3 rounded-xl border border-line p-4"
        >
          <div>
            <label htmlFor="new-folder-name" className="field-label">
              Folder name
            </label>
            <input
              id="new-folder-name"
              autoFocus
              value={newName}
              maxLength={MAX_FOLDER_NAME}
              onChange={(e) => setNewName(e.target.value)}
              autoComplete="off"
              className="field-input mt-1 w-48"
            />
          </div>
          <ColorSwatches
            value={newColor}
            onChange={setNewColor}
            label="New folder color"
            disabled={folderBusy}
          />
          <button
            type="submit"
            disabled={!newName.trim() || folderBusy}
            className="min-h-11 rounded-md bg-brand px-4 py-2 text-sm font-medium text-brand-ink hover:opacity-90 disabled:opacity-40"
          >
            {folderBusy ? "Creating…" : "Create folder"}
          </button>
          <button
            type="button"
            onClick={() => setCreating(false)}
            disabled={folderBusy}
            className="min-h-11 px-2 text-sm text-muted hover:text-ink disabled:opacity-50"
          >
            Cancel
          </button>
        </form>
      )}

      {/* Edit active folder */}
      {activeFolder && (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          {editing ? (
            <>
              <label htmlFor={`edit-folder-${activeFolder.id}`} className="sr-only">
                Folder name
              </label>
              <input
                id={`edit-folder-${activeFolder.id}`}
                defaultValue={activeFolder.name}
                maxLength={MAX_FOLDER_NAME}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.currentTarget.blur();
                  }
                }}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== activeFolder.name) void patchFolder(activeFolder.id, { name: v });
                }}
                disabled={folderBusy}
                className="field-input w-44 disabled:opacity-50"
              />
              <ColorSwatches
                value={activeFolder.color as FolderColor}
                onChange={(c) => void patchFolder(activeFolder.id, { color: c })}
                label={`Color for ${activeFolder.name}`}
                disabled={folderBusy}
              />
              <button
                type="button"
                onClick={() => void deleteFolder(activeFolder.id, activeFolder.name)}
                disabled={folderBusy}
                className="min-h-11 px-2 text-danger hover:underline disabled:opacity-50"
              >
                Delete folder
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                disabled={folderBusy}
                className="min-h-11 px-2 text-muted hover:text-ink disabled:opacity-50"
              >
                Done
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="min-h-11 px-2 text-muted hover:text-ink"
            >
              Edit “{activeFolder.name}”
            </button>
          )}
        </div>
      )}

      {notice && (
        <p
          role={notice.kind === "error" ? "alert" : "status"}
          aria-live={notice.kind === "error" ? "assertive" : "polite"}
          aria-atomic="true"
          className={`${notice.kind === "error" ? "status-error" : "status-info"} mt-4`}
        >
          {notice.message}
        </p>
      )}

      {loadError && (
        <div role="alert" className="status-warning mt-4">
          {loadError}
          <button
            type="button"
            onClick={() => setReloadKey((key) => key + 1)}
            className="ml-2 font-semibold underline"
          >
            Try now
          </button>
        </div>
      )}

      {/* Mobile cards + desktop table */}
      {visible.length === 0 ? (
        <p role="status" className="mt-8 text-sm text-muted">
          {jobs.length === 0
            ? "Nothing here yet — add a file or link above to create your first transcript."
            : "No transcripts in this folder yet."}
        </p>
      ) : (
        <div
          role="region"
          aria-label="Transcriptions"
          tabIndex={0}
          className="mt-6 md:overflow-x-auto"
        >
          <table className="block w-full text-left text-sm md:table md:min-w-[48rem]">
            <caption className="sr-only">
              Transcriptions, their current status, folders, processing quality, and length
            </caption>
            <thead className="sr-only border-b border-line text-muted md:not-sr-only md:table-header-group">
              <tr>
                <th scope="col" className="py-2 pr-4 font-medium">Recording</th>
                <th scope="col" className="py-2 pr-4 font-medium">Status</th>
                <th scope="col" className="py-2 pr-4 font-medium">Folder</th>
                <th scope="col" className="py-2 pr-4 font-medium">Quality</th>
                <th scope="col" className="py-2 pr-4 font-medium">Length</th>
                <th scope="col" className="py-2 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="grid gap-3 md:table-row-group">
              {visible.map((job) => {
                const name = jobName(job);
                const progress = jobProgress(job);
                const assigning = assigningJobs.has(job.id);
                const selectId = `folder-${job.id}`;
                return (
                  <tr
                    key={job.id}
                    className="grid grid-cols-2 gap-x-4 gap-y-4 rounded-xl border border-line p-4 align-top md:table-row md:rounded-none md:border-x-0 md:border-t-0 md:p-0"
                  >
                    <td className="col-span-2 min-w-0 md:table-cell md:max-w-60 md:py-3 md:pr-4">
                      <Link
                        href={`/jobs/${job.id}`}
                        title={name}
                        className="block break-words font-semibold hover:text-brand hover:underline md:truncate md:font-medium"
                      >
                        {name}
                      </Link>
                    </td>
                    <td className="col-span-2 md:table-cell md:max-w-56 md:py-3 md:pr-4">
                      <StatusBadge status={job.status} />
                      <p className="mt-1 text-xs leading-5 text-muted">{progress.description}</p>
                    </td>
                    <td className="col-span-2 border-t border-line pt-4 md:table-cell md:border-0 md:py-2 md:pr-4">
                      <label htmlFor={selectId} className="field-label md:sr-only">
                        Folder
                      </label>
                      <div
                        className="mt-1 flex items-center gap-2 md:mt-0 md:inline-flex"
                        aria-busy={assigning || undefined}
                      >
                        <span
                          aria-hidden="true"
                          className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                            job.folderId
                              ? folderDot(
                                  folders.find((folder) => folder.id === job.folderId)?.color ??
                                    DEFAULT_FOLDER_COLOR,
                                )
                              : "bg-transparent ring-1 ring-line"
                          }`}
                        />
                        <select
                          id={selectId}
                          aria-label={`Folder for ${name}`}
                          value={job.folderId ?? ""}
                          onChange={(event) =>
                            void assignFolder(job.id, event.target.value || null)
                          }
                          disabled={assigning}
                          className="min-h-11 min-w-0 flex-1 rounded-md border border-line bg-paper px-3 py-2 text-sm disabled:cursor-wait disabled:opacity-60 md:min-h-10 md:max-w-32 md:cursor-pointer md:truncate md:border-transparent md:bg-transparent md:py-1 md:pl-1 md:pr-5 md:text-muted md:hover:border-line"
                        >
                          <option value="">No folder</option>
                          {folders.map((folder) => (
                            <option key={folder.id} value={folder.id}>
                              {folder.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td className="md:table-cell md:py-3 md:pr-4">
                      <span className="block text-xs text-muted md:hidden">Quality</span>
                      <span className="capitalize">{job.tier}</span>
                    </td>
                    <td className="md:table-cell md:py-3 md:pr-4">
                      <span className="block text-xs text-muted md:hidden">Length</span>
                      {jobLength(job)}
                    </td>
                    <td className="col-span-2 md:table-cell md:py-2">
                      <Link
                        href={`/jobs/${job.id}`}
                        aria-label={`Open transcription: ${name}`}
                        className="button-secondary inline-flex w-full justify-center md:min-h-10 md:w-auto md:border-0 md:px-0 md:text-brand md:hover:underline"
                      >
                        Open transcription
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
