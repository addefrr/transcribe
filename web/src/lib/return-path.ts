/**
 * Resolve a user-supplied post-auth destination without allowing a network-path
 * redirect. URL parsing is deliberate: leading backslashes can be normalised
 * into an external host even when a raw string appears to start with `/`.
 */
export function safeReturnPath(value: unknown, fallback = "/dashboard"): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.includes("\\")) {
    return fallback;
  }

  try {
    const localOrigin = "https://local.invalid";
    const url = new URL(value, localOrigin);
    return url.origin === localOrigin
      ? `${url.pathname}${url.search}${url.hash}`
      : fallback;
  } catch {
    return fallback;
  }
}
