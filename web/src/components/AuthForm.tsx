"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useContent } from "@/components/ContentProvider";
import type { AuthState } from "@/app/(auth)/actions";

type Props = {
  title: string;
  cta: string;
  action: (prev: AuthState, formData: FormData) => Promise<AuthState>;
  altText: string;
  altHref: string;
  altLink: string;
  notice?: string;
  forgotHref?: string;
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
}: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const t = useContent().auth;
  return (
    <div className="mx-auto mt-16 w-full max-w-sm rounded-xl border border-line p-8">
      <h1 className="mb-6 text-2xl font-semibold">{title}</h1>
      {notice && (
        <p className="mb-4 rounded-md bg-green-100 px-3 py-2 text-sm text-green-800 dark:bg-green-950 dark:text-green-300">
          {notice}
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
        <label className="block">
          <span className="mb-1 flex items-center justify-between text-sm text-muted">
            <span>
              {t.passwordLabel} <span className="text-muted">{t.passwordHint}</span>
            </span>
            {forgotHref && (
              <Link href={forgotHref} className="text-brand hover:underline">
                {t.forgot}
              </Link>
            )}
          </span>
          <input
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="current-password"
            className="w-full rounded-md border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </label>
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-brand py-2 text-sm font-medium text-brand-ink hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "…" : cta}
        </button>
      </form>
      <p className="mt-4 text-sm text-muted">
        {altText}{" "}
        <Link href={altHref} className="text-brand hover:underline dark:text-brand">
          {altLink}
        </Link>
      </p>
    </div>
  );
}
