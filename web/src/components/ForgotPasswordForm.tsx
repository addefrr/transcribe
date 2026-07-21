"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useContent } from "@/components/ContentProvider";
import { requestPasswordReset } from "@/app/(auth)/actions";

export default function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, {});
  const t = useContent().auth;
  return (
    <div className="mx-auto mt-16 w-full max-w-sm rounded-xl border border-line p-8">
      <h1 className="mb-2 text-2xl font-semibold">{t.forgotTitle}</h1>
      <p className="mb-6 text-sm text-muted">{t.forgotBody}</p>
      {state.notice && (
        <p className="mb-4 rounded-md bg-green-100 px-3 py-2 text-sm text-green-800 dark:bg-green-950 dark:text-green-300">
          {state.notice}
        </p>
      )}
      <form action={formAction} className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm text-muted">{t.emailLabel}</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="w-full rounded-md border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </label>
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-brand py-2 text-sm font-medium text-brand-ink hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "…" : t.forgotCta}
        </button>
      </form>
      <p className="mt-4 text-sm text-muted">
        {t.forgotBack}{" "}
        <Link href="/login" className="text-brand hover:underline">
          {t.loginCta}
        </Link>
      </p>
    </div>
  );
}
