// Client-safe: detect whether a URL looks like a playlist we can expand.
// A YouTube "watch" URL can also carry a list= param (watching within a
// playlist); we only treat a dedicated /playlist URL, or an explicit
// playlist-only link, as a playlist.
export function isPlaylistUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();
  const isYouTube = host.includes("youtube.com") || host === "youtu.be";
  if (!isYouTube) return false;
  if (url.pathname.startsWith("/playlist")) return true;
  // A watch URL is a single video even if it has a list= param.
  return false;
}
