"use client";

import Link from "next/link";
import { useActionState, useId } from "react";
import { requestPasswordReset } from "@/app/(auth)/actions";
import { T } from "@/components/T";

export default function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, {});
  const emailId = useId();
  const noticeId = useId();
  const errorId = useId();

  return (
    <div className="mx-auto mt-10 w-full max-w-sm rounded-xl border border-line p-5 sm:mt-16 sm:p-8">
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">
        <T id="auth.forgotTitle" />
      </h1>
      <p className="mb-6 text-sm leading-6 text-muted">
        <T id="auth.forgotBody" />
      </p>

      {state.notice && (
        <p
          id={noticeId}
          role="status"
          aria-live="polite"
          className="mb-4 rounded-md bg-success-soft px-3 py-2 text-sm text-success"
        >
          {state.notice}
        </p>
      )}

      <form action={formAction} aria-busy={pending} className="space-y-4">
        <div>
          <label htmlFor={emailId} className="mb-1.5 block text-sm font-medium">
            <T id="auth.emailLabel" />
          </label>
          <input
            id={emailId}
            name="email"
            type="email"
            required
            autoComplete="email"
            aria-describedby={state.error ? errorId : state.notice ? noticeId : undefined}
            className="min-h-11 w-full rounded-md border border-line bg-transparent px-3 text-base focus:border-brand"
          />
        </div>

        {state.error && (
          <p
            id={errorId}
            role="alert"
            className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger"
          >
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="min-h-11 w-full rounded-md bg-brand px-4 text-sm font-semibold text-brand-ink hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
        >
          {pending ? <T id="auth.sendingReset" /> : <T id="auth.forgotCta" />}
        </button>
      </form>

      <p className="mt-4 text-sm text-muted">
        <T id="auth.forgotBack" />{" "}
        <Link
          href="/login"
          className="inline-flex min-h-11 items-center text-brand hover:underline"
        >
          <T id="auth.loginCta" />
        </Link>
      </p>
    </div>
  );
}
