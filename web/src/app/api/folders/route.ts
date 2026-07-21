import { asc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isFolderColor, MAX_FOLDER_NAME } from "@/lib/folders";
import { folders } from "@/lib/schema";

const MAX_FOLDERS_PER_USER = 100;

const createSchema = z.object({
  name: z.string().trim().min(1).max(MAX_FOLDER_NAME),
  color: z.string().refine(isFolderColor, "Unknown color"),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const rows = await db
    .select()
    .from(folders)
    .where(eq(folders.userId, user.id))
    .orderBy(asc(folders.createdAt));
  return NextResponse.json({ folders: rows });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const existing = await db
    .select({ id: folders.id })
    .from(folders)
    .where(eq(folders.userId, user.id));
  if (existing.length >= MAX_FOLDERS_PER_USER) {
    return NextResponse.json({ error: "Too many folders" }, { status: 429 });
  }

  const [folder] = await db
    .insert(folders)
    .values({ userId: user.id, name: parsed.data.name, color: parsed.data.color })
    .returning();
  return NextResponse.json({ folder }, { status: 201 });
}
