/**
 * Fast syntactic screen for user-submitted URLs, run at submission time so
 * obviously-bad URLs fail immediately with a clear message. The worker
 * re-checks with full DNS resolution (worker/worker/ssrf.py) before anything
 * is fetched — that check is the authoritative one.
 */
export function screenUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "That doesn't look like a valid URL.";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return "Only http(s) URLs are supported.";
  }
  // Dev/testing escape hatch — keep in sync with the worker's SSRF_ALLOW_PRIVATE.
  if (process.env.SSRF_ALLOW_PRIVATE === "1") return null;
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return "URLs must point to a public host.";
  }
  // IPv4 literal in a private/reserved range?
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    ) {
      return "URLs must point to a public host.";
    }
  }
  // IPv6 literal: loopback / link-local / unique-local.
  if (host.includes(":")) {
    const h = host.replace(/^\[|\]$/g, "");
    if (h === "::1" || h === "::" || h.startsWith("fe80") || h.startsWith("fc") || h.startsWith("fd")) {
      return "URLs must point to a public host.";
    }
  }
  return null;
}
