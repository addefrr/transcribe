# Transcribe browser extension

Transcribe audio or video **playing in your browser** using your Transcribe
account. Two ways to transcribe:

- **This tab's audio** — captures whatever is playing (works for YouTube,
  streamed/DRM-free media, web players, etc.), records it, and uploads it.
- **The playing media (link)** — if the page exposes a direct `http(s)` media
  URL, it's submitted as a URL job (cheaper, no upload).

It talks to your Transcribe server's token-authenticated API
(`/api/uploads`, `/api/jobs`), which is CORS-enabled for the extension.

## Setup

1. In the web app, open **API tokens** (footer → *Extension*, or `/tokens`) and
   create a token. Copy it.
2. Load the extension (below), click its icon, and enter:
   - **API base URL** — e.g. `http://localhost:3000` or your deployed
     `https://…` origin.
   - **API token** — the `sk_…` value you copied.
3. Pick a quality tier + language, open a page that's playing audio/video, and
   click **Transcribe this tab's audio** → **Stop & transcribe**. The popup
   links to the finished transcript in the web app.

## Install (unpacked) for development

**Chrome / Edge / Brave / Opera** (Manifest V3, native):
1. Go to `chrome://extensions`, enable **Developer mode**.
2. **Load unpacked** → select this `extension/` folder.

**Firefox** (115+):
1. Go to `about:debugging#/runtime/this-firefox`.
2. **Load Temporary Add-on** → select `extension/manifest.json`.
   (Firefox uses the same MV3 source; the `browser`/`chrome` namespaces are
   handled by a tiny shim in each script. Tab-audio capture behaves slightly
   differently on Firefox; the URL-job path always works.)

## Packaging

- Chrome/Firefox: zip the folder's contents (not the folder):
  `cd extension && zip -r ../transcribe-extension.zip . -x '*.DS_Store'`.
  Upload the zip to the Chrome Web Store / AMO, or load it unpacked.
- **Safari**: Safari runs Web Extensions but needs a one-time conversion with
  Xcode on macOS (not possible on Linux/CI):
  `xcrun safari-web-extension-converter extension/`
  then build/run the generated Xcode project. The extension source here is
  written to be converter-compatible.

## Files

- `manifest.json` — MV3 manifest (permissions: `tabCapture`, `offscreen`,
  `storage`, `scripting`, `tabs`; `host_permissions: <all_urls>` so it can reach
  any configured API base and read a page's media URL).
- `popup.html` / `popup.js` — settings + actions + status.
- `background.js` — service worker; owns tab capture + the offscreen recorder so
  recording survives the popup closing.
- `offscreen.html` / `offscreen.js` — records the captured stream and uploads it.
- `api.js` — shared token-auth API client (`/api/uploads`, `/api/jobs`).

## Notes

- Tokens are stored in the browser's extension storage and sent as
  `Authorization: Bearer <token>`. Treat them like passwords — anyone with a
  token can spend your credits. Revoke on the API tokens page.
- Captured tab audio is uploaded as WebM/Opus; the worker measures duration by
  decoding when the container lacks it, so billing is exact.
