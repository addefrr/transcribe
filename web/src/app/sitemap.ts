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

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = publicOrigin();
  return [
    {
      url: `${origin}/`,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${origin}/plans`,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${origin}/billing`,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${origin}/support`,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${origin}/privacy`,
      changeFrequency: "yearly",
      priority: 0.4,
    },
    {
      url: `${origin}/terms`,
      changeFrequency: "yearly",
      priority: 0.4,
    },
  ];
}
