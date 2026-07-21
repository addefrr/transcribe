import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRequestUser } from "@/lib/auth";
import { MAX_FILESIZE_BYTES, prepareUpload } from "@/lib/storage";

const bodySchema = z.object({
  filename: z.string().min(1).max(300),
  size: z.number().int().positive(),
  contentType: z.string().max(200).default("application/octet-stream"),
});

/** Step 1 of an upload: get a key + URL to PUT the file to. */
export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (parsed.data.size > MAX_FILESIZE_BYTES) {
    return NextResponse.json(
      { error: `File is too large (max ${Math.floor(MAX_FILESIZE_BYTES / 1024 ** 2)} MB).` },
      { status: 413 },
    );
  }
  const prepared = await prepareUpload(parsed.data.filename, parsed.data.contentType);
  return NextResponse.json(prepared);
}
