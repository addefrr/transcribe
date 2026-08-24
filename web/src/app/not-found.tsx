import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <section aria-labelledby="not-found-heading" className="mx-auto max-w-xl py-16 sm:py-24">
      <p className="text-sm font-medium text-muted">404 · Page not found</p>
      <h1 id="not-found-heading" className="mt-2 text-3xl font-semibold tracking-tight">
        This address doesn’t lead to a page.
      </h1>
      <p className="mt-3 text-muted">
        The link may be outdated, mistyped, or no longer shared. Private transcripts are never
        exposed when a link is invalid.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/"
          className="rounded-md bg-ink px-5 py-2.5 text-sm font-medium text-paper hover:opacity-90"
        >
          Go to homepage
        </Link>
        <Link
          href="/dashboard"
          className="rounded-md border border-line px-5 py-2.5 text-sm font-medium hover:border-ink"
        >
          Open my transcriptions
        </Link>
      </div>
    </section>
  );
}
