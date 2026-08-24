import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { screenUrl } from "@/lib/ssrf";

/**
 * Compatibility endpoint for older clients.
 *
 * The public web process deliberately does not fetch or execute yt-dlp against
 * user URLs. New submissions are probed by the isolated worker and pause for
 * an explicit price confirmation before paid transcription starts.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const url = (req.nextUrl.searchParams.get("url") ?? "").trim();
  const problem = url ? screenUrl(url) : "Enter a URL first.";
  if (problem) {
    return NextResponse.json(
      { durationSeconds: null, title: null, cached: false, error: problem },
      { status: 400 },
    );
  }
  return NextResponse.json({
    durationSeconds: null,
    title: null,
    cached: false,
    requiresWorkerProbe: true,
  });
}
