import { and, eq, gt, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { uploads } from "@/lib/schema";
import { isValidUploadKey, saveLocalUpload, STORAGE_DRIVER } from "@/lib/storage";

/** Step 2 of an upload (local storage driver only): PUT the file bytes. */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (STORAGE_DRIVER !== "local") {
    return NextResponse.json({ error: "Direct uploads are disabled" }, { status: 404 });
  }
  const { key } = await ctx.params;
  if (!isValidUploadKey(key) || !req.body) {
    return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
  }
  const [intent] = await db
    .select({ sizeBytes: uploads.sizeBytes })
    .from(uploads)
    .where(
      and(
        eq(uploads.key, key),
        eq(uploads.userId, user.id),
        isNull(uploads.claimedAt),
        gt(uploads.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!intent) {
    return NextResponse.json({ error: "This upload link is invalid or has expired." }, { status: 404 });
  }
  try {
    await saveLocalUpload(key, req.body, intent.sizeBytes);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
