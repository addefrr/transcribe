"use client";

import Link from "next/link";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <head>
        <title>Page unavailable — Transcribe</title>
        <meta name="robots" content="noindex,nofollow" />
      </head>
      <body
        style={{
          margin: 0,
          background: "#fff",
          color: "#0a0a0b",
          fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        }}
      >
        <main
          style={{
            boxSizing: "border-box",
            width: "min(100% - 2rem, 40rem)",
            margin: "0 auto",
            padding: "6rem 0",
          }}
        >
          <p style={{ margin: 0, color: "#66666f", fontSize: "0.875rem" }}>
            Transcribe is temporarily unavailable
          </p>
          <h1 style={{ margin: "0.5rem 0 0", fontSize: "2rem", lineHeight: 1.2 }}>
            This page couldn’t be loaded.
          </h1>
          <p style={{ margin: "1rem 0 0", color: "#52525b", lineHeight: 1.6 }}>
            Try once more. If this happened just after a submission, check your dashboard before
            repeating it so you don’t create the same job twice.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginTop: "1.5rem" }}>
            <button
              type="button"
              onClick={reset}
              style={{
                border: 0,
                borderRadius: "0.375rem",
                background: "#0a0a0b",
                color: "#fff",
                cursor: "pointer",
                font: "inherit",
                fontWeight: 600,
                padding: "0.7rem 1rem",
              }}
            >
              Try again
            </button>
            <Link
              href="/"
              style={{
                border: "1px solid #d4d4d8",
                borderRadius: "0.375rem",
                color: "#0a0a0b",
                fontWeight: 600,
                padding: "0.65rem 1rem",
                textDecoration: "none",
              }}
            >
              Go to homepage
            </Link>
          </div>
        </main>
      </body>
    </html>
  );
}
