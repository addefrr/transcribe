import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isValidUploadKey, saveLocalUpload, STORAGE_DRIVER } from "@/lib/storage";

/** Step 2 of an upload (local storage driver only): PUT the file bytes. */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (STORAGE_DRIVER !== "local") {
    return NextResponse.json({ error: "Direct uploads are disabled" }, { status: 404 });
  }
  const { key } = await ctx.params;
  if (!isValidUploadKey(key) || !req.body) {
    return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
  }
  try {
    await saveLocalUpload(key, req.body);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
