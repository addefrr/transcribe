// Shared Transcribe API client for the extension. Uses the token-authed,
// CORS-enabled endpoints (/api/uploads, /api/jobs). Plain globals so both the
// popup and the offscreen document can include it with a <script> tag.

async function _json(res, fallback) {
  if (res.ok) return res.json();
  let msg = fallback;
  try {
    msg = (await res.json()).error || fallback;
  } catch {
    /* non-JSON error */
  }
  throw new Error(msg);
}

// Submit a direct media URL (cheap — no capture/upload).
async function apiCreateUrlJob(apiBase, token, { url, tier, language, diarize }) {
  const res = await fetch(apiBase + "/api/jobs", {
    method: "POST",
    headers: { authorization: "Bearer " + token, "content-type": "application/json" },
    body: JSON.stringify({ sourceType: "url", url, tier, language, diarize }),
  });
  return (await _json(res, "Could not create job")).job;
}

// Upload a recorded blob (prepare -> PUT -> create job).
async function apiUploadBlob(apiBase, token, blob, filename, { tier, language, diarize }) {
  const prep = await fetch(apiBase + "/api/uploads", {
    method: "POST",
    headers: { authorization: "Bearer " + token, "content-type": "application/json" },
    body: JSON.stringify({
      filename,
      size: blob.size,
      contentType: blob.type || "audio/webm",
    }),
  });
  const { key, uploadUrl, mode } = await _json(prep, "Upload could not be prepared");

  // local driver: PUT to our API (token + CORS). s3: presigned URL, no auth header.
  const putUrl = mode === "local" ? apiBase + uploadUrl : uploadUrl;
  const putHeaders = { "content-type": blob.type || "audio/webm" };
  if (mode === "local") putHeaders.authorization = "Bearer " + token;
  const put = await fetch(putUrl, { method: "PUT", headers: putHeaders, body: blob });
  if (!put.ok) throw new Error("Upload failed — try again.");

  const res = await fetch(apiBase + "/api/jobs", {
    method: "POST",
    headers: { authorization: "Bearer " + token, "content-type": "application/json" },
    body: JSON.stringify({
      sourceType: "upload",
      uploadKey: key,
      originalFilename: filename,
      tier,
      language,
      diarize,
    }),
  });
  return (await _json(res, "Could not create job")).job;
}
