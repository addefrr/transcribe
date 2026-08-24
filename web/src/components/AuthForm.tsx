"use client";

import Link from "next/link";
import { useActionState, useId } from "react";
import type { AuthState } from "@/app/(auth)/actions";
import { T } from "@/components/T";

type Props = {
  title: React.ReactNode;
  cta: React.ReactNode;
  action: (prev: AuthState, formData: FormData) => Promise<AuthState>;
  altText: React.ReactNode;
  altHref: string;
  altLink: React.ReactNode;
  notice?: React.ReactNode;
  forgotHref?: string;
  returnTo?: string;
};

export default function AuthForm({
  title,
  cta,
  action,
  altText,
  altHref,
  altLink,
  notice,
  forgotHref,
  returnTo,
}: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const emailId = useId();
  const passwordId = useId();
  const passwordHintId = useId();
  const errorId = useId();
  const signingIn = Boolean(forgotHref);
  const emailDescription = state.error ? errorId : undefined;
  const passwordDescription =
    [!signingIn ? passwordHintId : null, state.error ? errorId : null]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <div className="mx-auto mt-10 w-full max-w-sm rounded-xl border border-line p-5 sm:mt-16 sm:p-8">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">{title}</h1>
      {notice && (
        <p
          role="status"
          aria-live="polite"
          className="mb-4 rounded-md bg-success-soft px-3 py-2 text-sm text-success"
        >
          {notice}
        </p>
      )}

      <form action={formAction} aria-busy={pending} className="space-y-4">
        {returnTo && <input type="hidden" name="next" value={returnTo} />}
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
            aria-describedby={emailDescription}
            className="min-h-11 w-full rounded-md border border-line bg-transparent px-3 text-base focus:border-brand"
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <label htmlFor={passwordId} className="text-sm font-medium">
              <T id="auth.passwordLabel" />
            </label>
            {forgotHref && (
              <Link
                href={forgotHref}
                className="inline-flex min-h-11 items-center text-sm text-brand hover:underline"
              >
                <T id="auth.forgot" />
              </Link>
            )}
          </div>
          <input
            id={passwordId}
            name="password"
            type="password"
            required
            minLength={8}
            maxLength={256}
            autoComplete={signingIn ? "current-password" : "new-password"}
            aria-describedby={passwordDescription}
            className="min-h-11 w-full rounded-md border border-line bg-transparent px-3 text-base focus:border-brand"
          />
          {!signingIn && (
            <p id={passwordHintId} className="mt-1.5 text-sm text-muted">
              <T id="auth.passwordHint" />
            </p>
          )}
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
          {pending ? (
            <T id={signingIn ? "auth.loggingIn" : "auth.signingUp"} />
          ) : (
            cta
          )}
        </button>
      </form>

      <p className="mt-4 text-sm text-muted">
        {altText}{" "}
        <Link
          href={altHref}
          className="inline-flex min-h-11 items-center text-brand hover:underline dark:text-brand"
        >
          {altLink}
        </Link>
      </p>
    </div>
  );
}
