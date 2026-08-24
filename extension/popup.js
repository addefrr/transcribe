// Popup UI: stores account settings, shows capture / URL actions, and reflects
// recording state (which actually lives in the background + offscreen document,
// so it survives the popup closing).

const B = globalThis.browser || globalThis.chrome;
const $ = (id) => document.getElementById(id);

let settings = { apiBase: "", token: "", tier: "standard", language: "" };
let pageMediaUrl = null; // a direct http(s) media URL found on the page, if any

async function loadSettings() {
  const s = await B.storage.local.get(["apiBase", "token", "tier", "language"]);
  let apiBase = "";
  try {
    apiBase = s.apiBase ? normalizeApiBase(s.apiBase) : "";
  } catch {
    // An old or manually edited insecure origin must be confirmed again.
  }
  settings = { apiBase, token: s.token || "", tier: s.tier || "standard", language: s.language || "" };
}
async function saveSettings(patch) {
  Object.assign(settings, patch);
  await B.storage.local.set(settings);
}

function normalizeApiBase(raw) {
  const url = new URL(raw);
  const localHttp =
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !localHttp) {
    throw new Error("Use an HTTPS API address (HTTP is allowed only on localhost).");
  }
  if (url.username || url.password) {
    throw new Error("The API address must not contain a username or password.");
  }
  return url.origin;
}

function validatedApiBase(input) {
  try {
    const value = normalizeApiBase(input.value.trim());
    input.setCustomValidity("");
    return value;
  } catch (error) {
    input.setCustomValidity(error instanceof Error ? error.message : "Enter a valid API address.");
    input.reportValidity();
    return null;
  }
}

function setStatus(message) {
  const status = $("status");
  status.setAttribute("role", message.startsWith("Error:") ? "alert" : "status");
  status.textContent = message;
}

function setStartedStatus(job) {
  const status = $("status");
  status.setAttribute("role", "status");
  const link = document.createElement("a");
  link.href = new URL("/jobs/" + encodeURIComponent(String(job.id)), settings.apiBase).href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = "View transcript →";
  status.replaceChildren(document.createTextNode("Started ✓ "), link);
}

function showSetupOrMain() {
  const ready = settings.apiBase && settings.token;
  $("setup").hidden = ready;
  $("main").hidden = !ready;
  if (ready) {
    $("tier").value = settings.tier;
    $("language").value = settings.language;
    $("apiBase2").value = settings.apiBase;
  } else {
    $("apiBase").value = settings.apiBase;
  }
}

async function detectPageMedia() {
  try {
    const [tab] = await B.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    const [res] = await B.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const el = [...document.querySelectorAll("video,audio")].find((m) => m.currentSrc);
        const src = el?.currentSrc || "";
        return /^https?:\/\//.test(src) ? src : null;
      },
    });
    pageMediaUrl = res?.result || null;
    $("urlJob").hidden = !pageMediaUrl;
  } catch {
    /* no scripting permission on this page (e.g. chrome://) */
  }
}

async function refreshRecordingState() {
  const { recording } = (await B.runtime.sendMessage({ type: "getState" })) || {};
  $("record").hidden = !!recording;
  $("stop").hidden = !recording;
  if (recording) setStatus("Recording this tab… play the audio, then Stop.");
}

async function init() {
  await loadSettings();
  showSetupOrMain();
  if (settings.apiBase && settings.token) {
    await detectPageMedia();
    await refreshRecordingState();
  }
}

$("saveSetup").onclick = async () => {
  const apiBase = validatedApiBase($("apiBase"));
  if (!apiBase) return;
  await saveSettings({ apiBase, token: $("token").value.trim() });
  showSetupOrMain();
  init();
};
$("save2").onclick = async () => {
  const apiBase = validatedApiBase($("apiBase2"));
  if (!apiBase) return;
  const patch = { apiBase };
  if ($("token2").value.trim()) patch.token = $("token2").value.trim();
  await saveSettings(patch);
  $("token2").value = "";
  setStatus("Saved.");
};
$("tier").onchange = () => saveSettings({ tier: $("tier").value });
$("language").onchange = () => saveSettings({ language: $("language").value });

$("record").onclick = async () => {
  const [tab] = await B.tabs.query({ active: true, currentWindow: true });
  setStatus("Starting…");
  const r = await B.runtime.sendMessage({ type: "start", tabId: tab.id, settings });
  if (r?.error) return setStatus("Error: " + r.error);
  $("record").hidden = true;
  $("stop").hidden = false;
  setStatus("Recording this tab… play the audio, then Stop.");
};

$("stop").onclick = async () => {
  $("stop").disabled = true;
  setStatus("Uploading & queueing…");
  const r = await B.runtime.sendMessage({ type: "stop" });
  $("stop").disabled = false;
  $("stop").hidden = true;
  $("record").hidden = false;
  if (r?.error) return setStatus("Error: " + r.error);
  if (r?.job) setStartedStatus(r.job);
};

$("urlJob").onclick = async () => {
  if (!pageMediaUrl) return;
  setStatus("Submitting link…");
  try {
    const job = await apiCreateUrlJob(settings.apiBase, settings.token, {
      url: pageMediaUrl,
      tier: settings.tier,
      language: settings.language,
      diarize: false,
    });
    setStartedStatus(job);
  } catch (e) {
    setStatus("Error: " + e.message);
  }
};

init();
