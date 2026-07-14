"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { AuthState } from "@/app/(auth)/actions";

type Props = {
  title: string;
  cta: string;
  action: (prev: AuthState, formData: FormData) => Promise<AuthState>;
  altText: string;
  altHref: string;
  altLink: string;
};

export default function AuthForm({ title, cta, action, altText, altHref, altLink }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <div className="mx-auto mt-16 w-full max-w-sm rounded-xl border border-zinc-200 p-8 dark:border-zinc-800">
      <h1 className="mb-6 text-2xl font-semibold">{title}</h1>
      <form action={formAction} className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm text-zinc-600 dark:text-zinc-400">Email</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-zinc-700"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-zinc-600 dark:text-zinc-400">
            Password <span className="text-zinc-400">(min. 8 characters)</span>
          </span>
          <input
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="current-password"
            className="w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-zinc-700"
          />
        </label>
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {pending ? "…" : cta}
        </button>
      </form>
      <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
        {altText}{" "}
        <Link href={altHref} className="text-indigo-600 hover:underline dark:text-indigo-400">
          {altLink}
        </Link>
      </p>
    </div>
  );
}
