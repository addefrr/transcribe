import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRequestUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { and, eq, gt, isNull } from "drizzle-orm";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { uploads, users } from "@/lib/schema";
import { MAX_FILESIZE_BYTES, prepareUpload } from "@/lib/storage";

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const MAX_PENDING_UPLOADS = positiveInteger(process.env.MAX_PENDING_UPLOADS_PER_USER, 3);

const bodySchema = z.object({
  filename: z.string().min(1).max(300),
  size: z.number().int().positive(),
  contentType: z.string().max(200).default("application/octet-stream"),
});

/** Step 1 of an upload: get a key + URL to PUT the file to. */
export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!user.emailVerified) {
    return NextResponse.json({ error: "Verify your email before uploading media." }, { status: 403 });
  }

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
  const limit = await rateLimit(
    `upload-intent:${user.id}:${await clientIp()}`,
    30,
    60 * 60 * 1000,
  );
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many uploads were prepared. Try again after the current hour." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
    );
  }

  // Serialize count-and-create per account. This bounds abandoned presigned
  // uploads as well as local disk usage across simultaneous tabs/instances.
  const result = await db.transaction(async (tx) => {
    const [account] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, user.id))
      .for("update")
      .limit(1);
    if (!account) return { kind: "missing" as const };
    const pending = await tx
      .select({ key: uploads.key })
      .from(uploads)
      .where(
        and(
          eq(uploads.userId, user.id),
          isNull(uploads.claimedAt),
          gt(uploads.expiresAt, new Date()),
        ),
      )
      .limit(MAX_PENDING_UPLOADS);
    if (pending.length >= MAX_PENDING_UPLOADS) return { kind: "limit" as const };

    const prepared = await prepareUpload(
      parsed.data.filename,
      parsed.data.contentType,
      parsed.data.size,
    );
    await tx.insert(uploads).values({
      key: prepared.key,
      userId: user.id,
      originalFilename: parsed.data.filename,
      contentType: parsed.data.contentType,
      sizeBytes: parsed.data.size,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    return { kind: "created" as const, prepared };
  });
  if (result.kind === "missing") {
    return NextResponse.json({ error: "Account not found" }, { status: 401 });
  }
  if (result.kind === "limit") {
    return NextResponse.json(
      {
        error: `Finish or wait for one of your ${MAX_PENDING_UPLOADS} prepared uploads before adding another.`,
      },
      { status: 429 },
    );
  }
  return NextResponse.json(result.prepared);
}
