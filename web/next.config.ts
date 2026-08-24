import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

function storageOrigins(): string[] {
  if (process.env.STORAGE_DRIVER !== "s3") return [];
  try {
    if (!process.env.S3_ENDPOINT) return [];
    const endpoint = new URL(process.env.S3_ENDPOINT);
    if (endpoint.protocol !== "http:" && endpoint.protocol !== "https:") return [];
    const origins = new Set([endpoint.origin]);

    // With virtual-hosted addressing (the documented R2 production setup),
    // the SDK signs https://<bucket>.<endpoint>/ rather than the endpoint
    // origin itself. Permit that exact origin so browser PUTs and redirected
    // retained audio work without opening a broad wildcard in the CSP.
    const bucket = process.env.S3_BUCKET?.trim();
    if (
      process.env.S3_FORCE_PATH_STYLE === "0" &&
      bucket &&
      /^[a-z0-9][a-z0-9.-]*[a-z0-9]$/i.test(bucket) &&
      !endpoint.hostname.includes(":")
    ) {
      const virtualHosted = new URL(endpoint);
      virtualHosted.hostname = `${bucket}.${endpoint.hostname}`;
      origins.add(virtualHosted.origin);
    }
    return [...origins];
  } catch {
    return [];
  }
}

const objectStoreSources = storageOrigins();
const objectStoreDirective = objectStoreSources.length
  ? ` ${objectStoreSources.join(" ")}`
  : "";
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${objectStoreDirective}`,
  `media-src 'self' blob:${objectStoreDirective}`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    // Next's bootstrap and the early theme script currently require inline
    // scripts. All resource classes are nevertheless allow-listed explicitly;
    // a nonce can replace unsafe-inline when the rendering layer owns one.
    value: contentSecurityPolicy,
  },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), geolocation=(), microphone=(self), payment=(self), usb=(), clipboard-write=(self)",
  },
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }]
    : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  outputFileTracingRoot: projectRoot,
  turbopack: {
    root: projectRoot,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
