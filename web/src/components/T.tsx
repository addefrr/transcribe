"use client";

import { fill } from "@/lib/content";
import { useContentCtx } from "./ContentProvider";

// Renders an editable content string by id ("namespace.key"). Outside admin edit
// mode it's just text (no wrapper element), so it can sit inline anywhere. In
// edit mode it becomes a click-to-edit affordance that opens the inline editor.
export function T({
  id,
  vars,
}: {
  id: string;
  vars?: Record<string, string | number>;
}) {
  const { content, isAdmin, editing, openEdit } = useContentCtx();
  const dot = id.indexOf(".");
  const ns = id.slice(0, dot);
  const key = id.slice(dot + 1);
  const raw = (content as unknown as Record<string, Record<string, string>>)[ns]?.[key] ?? id;
  const text = vars ? fill(raw, vars) : raw;

  if (!(isAdmin && editing)) return <>{text}</>;

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        openEdit(ns, key, (e.currentTarget as HTMLElement).getBoundingClientRect());
      }}
      title={`Edit ${id}`}
      className="cursor-text rounded-sm decoration-brand/60 underline decoration-dotted underline-offset-2 hover:bg-brand/10"
    >
      {text}
    </span>
  );
}
