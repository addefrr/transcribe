import { NextResponse } from "next/server";

// The browser extension calls the job/upload APIs cross-origin (its page origin
// is a chrome-extension:// / moz-extension:// URL, not this site), so those
// routes need permissive CORS. Auth is a Bearer token in the Authorization
// header — not cookies — so a wildcard origin is safe here (no credentials are
// sent, and same-site pages keep using cookies as before).
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Max-Age": "86400",
};

export function middleware(req: Request) {
  if (req.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
  }
  const res = NextResponse.next();
  for (const [k, v] of Object.entries(CORS_HEADERS)) res.headers.set(k, v);
  return res;
}

export const config = {
  matcher: ["/api/jobs/:path*", "/api/uploads/:path*"],
};
