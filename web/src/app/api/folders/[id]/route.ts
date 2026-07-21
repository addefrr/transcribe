import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isFolderColor, MAX_FOLDER_NAME } from "@/lib/folders";
import { folders } from "@/lib/schema";
import { isUuid } from "@/lib/uuid";

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(MAX_FOLDER_NAME).optional(),
    color: z.string().refine(isFolderColor, "Unknown color").optional(),
  })
  .refine((v) => v.name !== undefined || v.color !== undefined, "Nothing to update");

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const [folder] = await db
    .update(folders)
    .set(parsed.data)
    .where(and(eq(folders.id, id), eq(folders.userId, user.id)))
    .returning();
  if (!folder) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ folder });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // The jobs.folder_id FK is ON DELETE SET NULL, so filed transcripts survive.
  const [folder] = await db
    .delete(folders)
    .where(and(eq(folders.id, id), eq(folders.userId, user.id)))
    .returning();
  if (!folder) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
