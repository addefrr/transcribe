// Offscreen document: captures the tab audio into a MediaRecorder and, on stop,
// uploads the recording and creates a job. Lives here (not the service worker)
// because MediaRecorder/getUserMedia need a document context.

const B = globalThis.browser || globalThis.chrome;

let recorder = null;
let chunks = [];
let stream = null;
let audioCtx = null;
let settings = null;

function pickMime() {
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/ogg"]) {
    if (MediaRecorder.isTypeSupported(m)) return { mimeType: m };
  }
  return undefined;
}

function cleanup() {
  try {
    stream?.getTracks().forEach((t) => t.stop());
    audioCtx?.close();
  } catch {
    /* ignore */
  }
  stream = null;
  audioCtx = null;
}

async function start(streamId, s) {
  settings = s;
  stream = await navigator.mediaDevices.getUserMedia({
    audio: { mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: streamId } },
  });
  // tabCapture mutes the tab by default — pipe it back so the user still hears it.
  audioCtx = new AudioContext();
  audioCtx.createMediaStreamSource(stream).connect(audioCtx.destination);
  chunks = [];
  recorder = new MediaRecorder(stream, pickMime());
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  recorder.start();
}

function stopAndUpload() {
  return new Promise((resolve, reject) => {
    if (!recorder) return reject(new Error("Not recording"));
    recorder.onstop = async () => {
      try {
        const type = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunks, { type });
        cleanup();
        const name =
          "tab-recording-" +
          new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-") +
          ".webm";
        const job = await apiUploadBlob(settings.apiBase, settings.token, blob, name, {
          tier: settings.tier,
          language: settings.language,
          diarize: false,
        });
        resolve(job);
      } catch (e) {
        reject(e);
      }
    };
    recorder.stop();
  });
}

B.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.target !== "offscreen") return;
  (async () => {
    try {
      if (msg.type === "start") {
        await start(msg.streamId, msg.settings);
        sendResponse({ ok: true });
      } else if (msg.type === "stop") {
        const job = await stopAndUpload();
        sendResponse({ job });
      }
    } catch (e) {
      cleanup();
      sendResponse({ error: e.message });
    }
  })();
  return true;
});
