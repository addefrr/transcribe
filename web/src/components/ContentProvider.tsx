"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { type Content, DEFAULT_CONTENT } from "@/lib/content";

// Resolved site copy is fetched once server-side (getContent) and handed to this
// provider in the root layout. Any client component reads strings via
// useContent(); admins can flip on "edit mode" to change copy inline (see <T>).

type EditTarget = { ns: string; key: string; rect: DOMRect } | null;

type Ctx = {
  content: Content;
  isAdmin: boolean;
  editing: boolean;
  setEditing: (v: boolean) => void;
  active: EditTarget;
  openEdit: (ns: string, key: string, rect: DOMRect) => void;
  closeEdit: () => void;
  updateKey: (ns: string, key: string, value: string) => void;
};

const ContentContext = createContext<Ctx>({
  content: DEFAULT_CONTENT as unknown as Content,
  isAdmin: false,
  editing: false,
  setEditing: () => {},
  active: null,
  openEdit: () => {},
  closeEdit: () => {},
  updateKey: () => {},
});

export function ContentProvider({
  value,
  isAdmin = false,
  children,
}: {
  value: Content;
  isAdmin?: boolean;
  children: React.ReactNode;
}) {
  const [content, setContent] = useState<Content>(value);
  const [editing, setEditingState] = useState(false);
  const [active, setActive] = useState<EditTarget>(null);

  // Restore the admin's edit-mode preference.
  useEffect(() => {
    if (isAdmin && localStorage.getItem("editText") === "on") setEditingState(true);
  }, [isAdmin]);

  const setEditing = useCallback((v: boolean) => {
    setEditingState(v);
    localStorage.setItem("editText", v ? "on" : "off");
    if (!v) setActive(null);
  }, []);

  const openEdit = useCallback(
    (ns: string, key: string, rect: DOMRect) => setActive({ ns, key, rect }),
    [],
  );
  const closeEdit = useCallback(() => setActive(null), []);

  const updateKey = useCallback((ns: string, key: string, val: string) => {
    setContent((c) => {
      const ncontent = structuredClone(c) as unknown as Record<string, Record<string, string>>;
      if (ncontent[ns] && key in ncontent[ns]) ncontent[ns][key] = val;
      return ncontent as unknown as Content;
    });
  }, []);

  return (
    <ContentContext.Provider
      value={{ content, isAdmin, editing, setEditing, active, openEdit, closeEdit, updateKey }}
    >
      {children}
      {isAdmin && <EditModeToggle editing={editing} setEditing={setEditing} />}
      {isAdmin && editing && active && <InlineEditor />}
    </ContentContext.Provider>
  );
}

export function useContent(): Content {
  return useContext(ContentContext).content;
}

export function useContentCtx(): Ctx {
  return useContext(ContentContext);
}

// Floating toggle, admin-only.
function EditModeToggle({
  editing,
  setEditing,
}: {
  editing: boolean;
  setEditing: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => setEditing(!editing)}
      className={`fixed bottom-4 left-4 z-50 rounded-full border px-4 py-2 text-sm font-medium shadow-lg ${
        editing
          ? "border-brand bg-brand text-brand-ink"
          : "border-line bg-paper text-muted hover:text-ink"
      }`}
      title="Toggle inline text editing (admin)"
    >
      {editing ? "✓ Editing text" : "✎ Edit text"}
    </button>
  );
}

// One inline editor at a time, positioned near the clicked string.
function InlineEditor() {
  const { content, active, closeEdit, updateKey } = useContentCtx();
  const [val, setVal] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (active) {
      const flat = content as unknown as Record<string, Record<string, string>>;
      setVal(flat[active.ns]?.[active.key] ?? "");
    }
  }, [active, content]);

  if (!active) return null;

  const top = Math.min(active.rect.bottom + 6, (typeof window !== "undefined" ? window.innerHeight : 800) - 180);
  const left = Math.min(active.rect.left, (typeof window !== "undefined" ? window.innerWidth : 1000) - 340);

  async function save() {
    if (!active) return;
    setSaving(true);
    try {
      const res = await fetch("/api/content", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ns: active.ns, key: active.key, value: val }),
      });
      if (res.ok) {
        updateKey(active.ns, active.key, val);
        closeEdit();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-[60]" onClick={closeEdit} />
      <div
        className="fixed z-[61] w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-paper p-3 shadow-xl"
        style={{ top, left }}
      >
        <p className="mb-1 text-xs text-muted">
          {active.ns}.{active.key} — {"{placeholders}"} stay as-is
        </p>
        <textarea
          autoFocus
          value={val}
          onChange={(e) => setVal(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-line bg-transparent px-2 py-1.5 text-sm outline-none focus:border-brand"
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-md bg-brand px-3 py-1 text-xs font-medium text-brand-ink hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={closeEdit}
            className="rounded-md px-3 py-1 text-xs text-muted hover:text-ink"
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}
