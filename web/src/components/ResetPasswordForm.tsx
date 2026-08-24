"use client";

import { useActionState, useId } from "react";
import { resetPassword } from "@/app/(auth)/actions";
import { T } from "@/components/T";

export default function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(resetPassword, {});
  const passwordId = useId();
  const hintId = useId();
  const errorId = useId();

  return (
    <div className="mx-auto mt-10 w-full max-w-sm rounded-xl border border-line p-5 sm:mt-16 sm:p-8">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">
        <T id="auth.resetTitle" />
      </h1>
      <form action={formAction} aria-busy={pending} className="space-y-4">
        <input type="hidden" name="token" value={token} />
        <div>
          <label htmlFor={passwordId} className="mb-1.5 block text-sm font-medium">
            <T id="auth.passwordLabel" />
          </label>
          <input
            id={passwordId}
            name="password"
            type="password"
            required
            minLength={8}
            maxLength={256}
            autoComplete="new-password"
            autoFocus
            aria-describedby={`${hintId}${state.error ? ` ${errorId}` : ""}`}
            className="min-h-11 w-full rounded-md border border-line bg-transparent px-3 text-base focus:border-brand"
          />
          <p id={hintId} className="mt-1.5 text-sm text-muted">
            <T id="auth.passwordHint" />
          </p>
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
          {pending ? <T id="auth.updatingPassword" /> : <T id="auth.resetCta" />}
        </button>
      </form>
    </div>
  );
}
