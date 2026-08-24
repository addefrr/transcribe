"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { type Content, DEFAULT_CONTENT } from "@/lib/content";

// Resolved site copy is fetched once server-side (getContent) and handed to this
// provider in the root layout. Any client component reads strings via
// useContent(); admins can flip on "edit mode" to change copy inline (see <T>).

type EditTarget = { ns: string; key: string } | null;

type Ctx = {
  content: Content;
  isAdmin: boolean;
  editing: boolean;
  setEditing: (v: boolean) => void;
  active: EditTarget;
  openEdit: (ns: string, key: string) => void;
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

  // Root layouts can persist across navigation. Reconcile a newly rendered
  // server snapshot (for example after saving the full developer form) instead
  // of leaving this provider stuck on its first useState value.
  useEffect(() => {
    setContent(value);
  }, [value]);

  // Restore the admin's edit-mode preference.
  useEffect(() => {
    try {
      if (isAdmin && localStorage.getItem("editText") === "on") setEditingState(true);
    } catch {
      // Storage can be disabled; editing still works for the current page.
    }
  }, [isAdmin]);

  const setEditing = useCallback((v: boolean) => {
    setEditingState(v);
    try {
      localStorage.setItem("editText", v ? "on" : "off");
    } catch {
      // Preference persistence is optional.
    }
    if (!v) setActive(null);
  }, []);

  const openEdit = useCallback((ns: string, key: string) => setActive({ ns, key }), []);
  const closeEdit = useCallback(() => setActive(null), []);

  // Delegate clicks while editing so <T> stays non-interactive. A string can
  // safely appear inside any existing link/button without invalid nesting.
  useEffect(() => {
    if (!(isAdmin && editing)) return;

    function editClickedText(event: MouseEvent) {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest("[data-content-editor]")) return;

      const interactive = event.target.closest("a, button, summary");
      const marker =
        event.target.closest<HTMLElement>("[data-content-edit]") ??
        interactive?.querySelector<HTMLElement>("[data-content-edit]");
      if (!marker) return;

      const ns = marker.dataset.contentNs;
      const key = marker.dataset.contentKey;
      if (!ns || !key) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      openEdit(ns, key);
    }

    document.addEventListener("click", editClickedText, true);
    return () => document.removeEventListener("click", editClickedText, true);
  }, [editing, isAdmin, openEdit]);

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
      {isAdmin && (
        <EditModeControls
          content={content}
          editing={editing}
          openEdit={openEdit}
          setEditing={setEditing}
        />
      )}
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

function firstContentKey(content: Content): { ns: string; key: string } | null {
  for (const [ns, entries] of Object.entries(content)) {
    const key = Object.keys(entries)[0];
    if (key) return { ns, key };
  }
  return null;
}

// Floating admin controls provide a keyboard route to every editable string.
function EditModeControls({
  content,
  editing,
  openEdit,
  setEditing,
}: {
  content: Content;
  editing: boolean;
  openEdit: (ns: string, key: string) => void;
  setEditing: (v: boolean) => void;
}) {
  const browse = () => {
    const first = firstContentKey(content);
    if (first) openEdit(first.ns, first.key);
  };

  if (editing) {
    return (
      <div
        data-content-editor=""
        className="fixed bottom-4 left-4 z-50 flex max-w-[calc(100vw-2rem)] gap-2 rounded-xl border border-line bg-paper p-2 shadow-xl"
        aria-label="Text editing controls"
      >
        <button
          type="button"
          onClick={browse}
          className="tap-target rounded-md border border-line px-3 text-sm font-medium hover:bg-paper-2"
        >
          Browse text
        </button>
        <button
          type="button"
          aria-pressed="true"
          onClick={() => setEditing(false)}
          className="tap-target rounded-md bg-brand px-3 text-sm font-medium text-brand-ink hover:opacity-90"
        >
          Done editing
        </button>
      </div>
    );
  }

  return (
    <button
      data-content-editor=""
      type="button"
      aria-pressed="false"
      onClick={() => setEditing(true)}
      className="tap-target fixed bottom-4 left-4 z-50 rounded-md border border-line bg-paper px-4 text-sm font-medium text-muted shadow-lg hover:text-ink"
      title="Turn on inline text editing"
    >
      Edit text
    </button>
  );
}

type ContentOption = { ns: string; key: string; value: string };

function contentOptions(content: Content): ContentOption[] {
  return Object.entries(content).flatMap(([ns, entries]) =>
    Object.entries(entries).map(([key, value]) => ({ ns, key, value })),
  );
}

// One focus-managed, viewport-safe editor for both inline and browsed copy.
function InlineEditor() {
  const { content, active, closeEdit, openEdit, updateKey } = useContentCtx();
  const flat = content as unknown as Record<string, Record<string, string>>;
  const raw = active ? (flat[active.ns]?.[active.key] ?? "") : "";
  const [val, setVal] = useState(raw);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const selectId = useId();
  const textareaId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const options = useMemo(() => contentOptions(content), [content]);

  useEffect(() => {
    restoreFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    textareaRef.current?.focus();

    function keepFocusInside(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeEdit();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute("hidden"));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", keepFocusInside);
    return () => {
      document.removeEventListener("keydown", keepFocusInside);
      restoreFocusRef.current?.focus();
    };
  }, [closeEdit]);

  if (!active) return null;

  const placeholders = Array.from(new Set(raw.match(/\{[^{}]+\}/g) ?? []));
  const missingPlaceholders = placeholders.filter((placeholder) => !val.includes(placeholder));
  const blank = val.trim().length === 0;

  function changeTarget(selected: string) {
    const [ns, ...keyParts] = selected.split(".");
    const key = keyParts.join(".");
    const next = flat[ns]?.[key] ?? "";
    setVal(next);
    setError(null);
    openEdit(ns, key);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  async function save() {
    if (!active) return;
    if (blank || missingPlaceholders.length > 0) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/content", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ns: active.ns, key: active.key, value: val }),
      });
      if (res.ok) {
        updateKey(active.ns, active.key, val);
        closeEdit();
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Couldn’t save this text. Try again.");
      }
    } catch {
      setError("Couldn’t save this text. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      data-content-editor=""
      className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-ink/40 p-4"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto rounded-xl border border-line bg-paper p-5 shadow-xl"
      >
        <h2 id={titleId} className="text-lg font-semibold">
          Edit site text
        </h2>
        <p id={descriptionId} className="mt-1 text-sm text-muted">
          Choose any copy field, then edit it below. Dynamic placeholders must remain unchanged.
        </p>

        <label htmlFor={selectId} className="mt-5 block text-sm font-medium">
          Text field
        </label>
        <select
          id={selectId}
          value={`${active.ns}.${active.key}`}
          onChange={(event) => changeTarget(event.target.value)}
          className="mt-1 min-h-11 w-full rounded-md border border-line bg-paper px-3 text-base sm:text-sm"
        >
          {options.map((option) => (
            <option key={`${option.ns}.${option.key}`} value={`${option.ns}.${option.key}`}>
              {option.ns}.{option.key}
            </option>
          ))}
        </select>

        <label htmlFor={textareaId} className="mt-4 block text-sm font-medium">
          Copy for {active.ns}.{active.key}
        </label>
        <textarea
          ref={textareaRef}
          id={textareaId}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          rows={6}
          aria-invalid={blank || missingPlaceholders.length > 0}
          aria-describedby={
            blank || missingPlaceholders.length > 0 ? `${descriptionId}-validation` : undefined
          }
          className="mt-1 w-full rounded-md border border-line bg-transparent px-3 py-2 text-base sm:text-sm"
        />
        {(blank || missingPlaceholders.length > 0) && (
          <p id={`${descriptionId}-validation`} className="mt-2 text-sm text-danger" role="alert">
            {blank
              ? "Text cannot be empty."
              : `Keep ${missingPlaceholders.join(", ")} in this field so live values still appear.`}
          </p>
        )}
        {error && (
          <p className="mt-2 text-sm text-danger" role="alert">
            {error}
          </p>
        )}
        <div className="mt-5 flex flex-wrap-reverse items-center justify-end gap-2">
          <button
            type="button"
            onClick={closeEdit}
            className="tap-target rounded-md border border-line px-4 text-sm font-medium hover:bg-paper-2"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || blank || missingPlaceholders.length > 0}
            className="tap-target rounded-md bg-brand px-4 text-sm font-medium text-brand-ink hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving text…" : "Save text"}
          </button>
        </div>
      </div>
    </div>
  );
}
