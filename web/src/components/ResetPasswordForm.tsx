"use client";

import { useActionState } from "react";
import { useContent } from "@/components/ContentProvider";
import { resetPassword } from "@/app/(auth)/actions";

export default function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(resetPassword, {});
  const t = useContent().auth;
  return (
    <div className="mx-auto mt-16 w-full max-w-sm rounded-xl border border-line p-8">
      <h1 className="mb-6 text-2xl font-semibold">{t.resetTitle}</h1>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="token" value={token} />
        <label className="block">
          <span className="mb-1 block text-sm text-muted">
            {t.passwordLabel} <span className="text-muted">{t.passwordHint}</span>
          </span>
          <input
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            autoFocus
            className="w-full rounded-md border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </label>
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-brand py-2 text-sm font-medium text-brand-ink hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "…" : t.resetCta}
        </button>
      </form>
    </div>
  );
}
