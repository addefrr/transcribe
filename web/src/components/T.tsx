"use client";

import { fill } from "@/lib/content";
import { useContentCtx } from "./ContentProvider";

// Renders an editable content string by id ("namespace.key"). Outside admin edit
// mode it's just text (no wrapper element), so it can sit inline anywhere. In
// edit mode it gets a non-interactive marker. ContentProvider delegates clicks
// from the document so this never creates a button inside a link or button.
export function T({
  id,
  vars,
}: {
  id: string;
  vars?: Record<string, string | number>;
}) {
  const { content, isAdmin, editing } = useContentCtx();
  const dot = id.indexOf(".");
  const ns = id.slice(0, dot);
  const key = id.slice(dot + 1);
  const raw = (content as unknown as Record<string, Record<string, string>>)[ns]?.[key] ?? id;
  const text = vars ? fill(raw, vars) : raw;

  if (!(isAdmin && editing)) return <>{text}</>;

  return (
    <span
      data-content-edit=""
      data-content-ns={ns}
      data-content-key={key}
      title={`Edit ${id}`}
      className="cursor-text rounded-sm decoration-brand underline decoration-dotted underline-offset-4 hover:bg-paper-2"
    >
      {text}
    </span>
  );
}
