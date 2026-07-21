import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAdmin } from "@/lib/admin";
import { getCurrentUser } from "@/lib/auth";
import { CONTENT_NAMESPACES, DEFAULT_CONTENT } from "@/lib/content";
import { getContent, setContent } from "@/lib/settings";

const bodySchema = z.object({
  ns: z.string(),
  key: z.string(),
  value: z.string().max(2000),
});

// Admin-only: overwrite one editable string (used by inline "Edit text" mode).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { ns, key, value } = parsed.data;

  // Only allow keys that exist in the defaults, so callers can't inject arbitrary data.
  const known = DEFAULT_CONTENT as unknown as Record<string, Record<string, string>>;
  if (!CONTENT_NAMESPACES.includes(ns as (typeof CONTENT_NAMESPACES)[number]) || !(key in known[ns])) {
    return NextResponse.json({ error: "Unknown content key" }, { status: 400 });
  }

  const current = await getContent();
  const next = structuredClone(current) as unknown as Record<string, Record<string, string>>;
  next[ns][key] = value;
  await setContent(next as unknown as typeof current);
  return NextResponse.json({ ok: true });
}
