"use client";

import Link from "next/link";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section
      aria-labelledby="page-error-heading"
      className="mx-auto max-w-xl py-16 sm:py-24"
    >
      <p className="text-sm font-medium text-muted">Something interrupted this page</p>
      <h1 id="page-error-heading" className="mt-2 text-3xl font-semibold tracking-tight">
        We couldn’t load that safely.
      </h1>
      <p className="mt-3 text-muted">
        Try the request again. If this happened just after a submission, check your dashboard
        before repeating it so you don’t create the same job twice.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={reset}
          className="button-primary"
        >
          Try again
        </button>
        <Link
          href="/"
          className="button-secondary"
        >
          Go to homepage
        </Link>
      </div>
    </section>
  );
}
