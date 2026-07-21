// Service worker: owns tab-audio capture + the offscreen recorder, so recording
// keeps going after the popup closes. The popup drives it via messages.

const B = globalThis.browser || globalThis.chrome;
let recording = false;

async function ensureOffscreen() {
  if (B.offscreen.hasDocument && (await B.offscreen.hasDocument())) return;
  await B.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["USER_MEDIA"],
    justification: "Record this tab's audio to transcribe it.",
  });
}

function getMediaStreamId(targetTabId) {
  return new Promise((resolve, reject) => {
    B.tabCapture.getMediaStreamId({ targetTabId }, (streamId) => {
      const err = B.runtime.lastError;
      if (err || !streamId) reject(new Error(err?.message || "Couldn't capture this tab's audio"));
      else resolve(streamId);
    });
  });
}

B.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.target === "offscreen") return; // messages meant for the offscreen doc
  (async () => {
    try {
      if (msg.type === "getState") {
        sendResponse({ recording });
      } else if (msg.type === "start") {
        const streamId = await getMediaStreamId(msg.tabId);
        await ensureOffscreen();
        await B.runtime.sendMessage({ target: "offscreen", type: "start", streamId, settings: msg.settings });
        recording = true;
        sendResponse({ ok: true });
      } else if (msg.type === "stop") {
        const result = await B.runtime.sendMessage({ target: "offscreen", type: "stop" });
        recording = false;
        sendResponse(result || { error: "No recording" });
      }
    } catch (e) {
      recording = false;
      sendResponse({ error: e.message });
    }
  })();
  return true; // keep the channel open for the async response
});
