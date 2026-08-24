import { NextRequest, NextResponse } from "next/server";

// The browser extension calls the job/upload APIs cross-origin (its page origin
// is a chrome-extension:// / moz-extension:// URL, not this site), so those
// routes need permissive CORS. Cross-origin callers authenticate with a Bearer
// token; credentialed CORS is deliberately not enabled.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Max-Age": "86400",
};

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const ORIGIN_EXEMPT_PATHS = new Set(["/api/stripe/webhook"]);

function isExtensionApi(pathname: string): boolean {
  return (
    pathname === "/api/jobs" ||
    pathname.startsWith("/api/jobs/") ||
    pathname === "/api/uploads" ||
    pathname.startsWith("/api/uploads/")
  );
}

function isBearerRequest(req: NextRequest): boolean {
  return req.headers.get("authorization")?.startsWith("Bearer ") === true;
}

function normalizedOrigin(raw: string): string | null {
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

function hasTrustedOrigin(req: NextRequest): boolean {
  const allowed = new Set([req.nextUrl.origin]);
  if (process.env.APP_URL) {
    const configured = normalizedOrigin(process.env.APP_URL);
    if (configured) allowed.add(configured);
  }

  const supplied = req.headers.get("origin");
  if (supplied) {
    const origin = normalizedOrigin(supplied);
    return origin !== null && allowed.has(origin);
  }

  // Modern browsers send Origin on unsafe fetch/form requests. This fallback
  // preserves same-origin browser clients that omit it while rejecting a
  // cross-site browser request and non-browser cookie replay by default.
  return req.headers.get("sec-fetch-site") === "same-origin";
}

export function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  const extensionApi = isExtensionApi(pathname);

  if (req.method === "OPTIONS" && extensionApi) {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
  }

  const cookieAuthenticated = req.cookies.has("session") && !isBearerRequest(req);
  if (
    cookieAuthenticated &&
    UNSAFE_METHODS.has(req.method) &&
    !ORIGIN_EXEMPT_PATHS.has(pathname) &&
    !hasTrustedOrigin(req)
  ) {
    return NextResponse.json(
      { error: "Request origin could not be verified." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  const res = NextResponse.next();
  if (extensionApi) {
    for (const [key, value] of Object.entries(CORS_HEADERS)) {
      res.headers.set(key, value);
    }
  }
  return res;
}

export const config = {
  matcher: ["/api/:path*"],
};
