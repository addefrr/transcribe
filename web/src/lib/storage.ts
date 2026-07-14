import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { Writable } from "node:stream";
import { randomUUID } from "node:crypto";

export const STORAGE_DRIVER = process.env.STORAGE_DRIVER ?? "local";
export const MAX_FILESIZE_BYTES = Number(
  process.env.MAX_FILESIZE_BYTES ?? 2 * 1024 * 1024 * 1024,
);

const UPLOAD_DIR = path.resolve(
  process.env.UPLOAD_DIR ?? path.join(process.cwd(), "..", "data", "uploads"),
);

// Keys are minted server-side: "<uuid>.<ext>". Anything else is rejected.
const KEY_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\.[a-z0-9]{1,10})?$/;

export function isValidUploadKey(key: string): boolean {
  return KEY_RE.test(key);
}

function makeKey(filename: string): string {
  const ext = path.extname(filename).toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 11);
  return `${randomUUID()}${ext}`;
}

let s3: S3Client | null = null;
function getS3(): S3Client {
  s3 ??= new S3Client({
    endpoint: process.env.S3_ENDPOINT || undefined,
    region: process.env.S3_REGION ?? "auto",
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "0",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
    },
  });
  return s3;
}

export type PreparedUpload = {
  key: string;
  uploadUrl: string;
  /** local uploads PUT to our own API; s3 uploads PUT straight to the bucket */
  mode: "local" | "s3";
};

export async function prepareUpload(
  filename: string,
  contentType: string,
): Promise<PreparedUpload> {
  const key = makeKey(filename);
  if (STORAGE_DRIVER === "s3") {
    const url = await getSignedUrl(
      getS3(),
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET ?? "transcribe",
        Key: key,
        ContentType: contentType || "application/octet-stream",
      }),
      { expiresIn: 3600 },
    );
    return { key, uploadUrl: url, mode: "s3" };
  }
  return { key, uploadUrl: `/api/uploads/${key}`, mode: "local" };
}

/** Local driver: stream a request body to disk, enforcing the size cap. */
export async function saveLocalUpload(
  key: string,
  body: ReadableStream<Uint8Array>,
): Promise<void> {
  if (STORAGE_DRIVER !== "local") throw new Error("local uploads are disabled");
  if (!isValidUploadKey(key)) throw new Error("invalid upload key");
  await mkdir(UPLOAD_DIR, { recursive: true });
  const dest = path.join(UPLOAD_DIR, key);

  let written = 0;
  const file = createWriteStream(dest, { flags: "w" });
  const sink = Writable.toWeb(file) as WritableStream<Uint8Array>;
  const counter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      written += chunk.byteLength;
      if (written > MAX_FILESIZE_BYTES) {
        controller.error(new Error("file exceeds the maximum allowed size"));
        return;
      }
      controller.enqueue(chunk);
    },
  });
  await body.pipeThrough(counter).pipeTo(sink);
}
