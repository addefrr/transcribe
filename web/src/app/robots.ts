import type { MetadataRoute } from "next";

function publicOrigin(): string {
  try {
    const url = new URL(process.env.APP_URL?.trim() || "http://localhost:3000");
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Invalid protocol");
    return url.origin;
  } catch {
    return "http://localhost:3000";
  }
}

export default function robots(): MetadataRoute.Robots {
  const origin = publicOrigin();
  // Public share pages emit noindex/nofollow themselves. They must remain
  // crawlable for compliant search engines to see that directive; robots.txt
  // is not an access-control mechanism.
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/account",
        "/api",
        "/batches",
        "/credits",
        "/dashboard",
        "/developer",
        "/forgot-password",
        "/jobs",
        "/login",
        "/reset-password",
        "/signup",
        "/tokens",
        "/verify-email",
      ],
    },
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
