"use client";

import { useActionState, useState } from "react";
import { createToken, revokeToken, type TokenState } from "@/app/tokens/actions";
import type { PublicApiToken } from "@/lib/apiTokens";

const field =
  "w-full rounded-md border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-brand";

function fmtDate(d: Date | null): string {
  if (!d) return "never";
  return new Date(d).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function TokenManager({ tokens }: { tokens: PublicApiToken[] }) {
  const [state, formAction, pending] = useActionState<TokenState, FormData>(createToken, {});
  const [copied, setCopied] = useState(false);

  async function copy(token: string) {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — user can select the field manually */
    }
  }

  return (
    <div className="space-y-8">
      {/* Freshly created token: shown once. */}
      {state.token && (
        <div className="rounded-xl border border-brand bg-brand/5 p-5">
          <p className="text-sm font-medium">Your new token “{state.name}”</p>
          <p className="mt-1 text-xs text-muted">
            Copy it now — for your security we won’t show it again.
          </p>
          <div className="mt-3 flex gap-2">
            <input readOnly value={state.token} className={`${field} font-mono`} />
            <button
              type="button"
              onClick={() => copy(state.token!)}
              className="shrink-0 rounded-md bg-brand px-4 py-2 text-sm font-medium text-brand-ink hover:opacity-90"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>
      )}

      {/* Create a token. */}
      <form action={formAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="block flex-1">
          <span className="mb-1 block text-sm text-muted">Token name</span>
          <input name="name" placeholder="e.g. My laptop extension" required className={field} />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand px-5 py-2 text-sm font-medium text-brand-ink hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "…" : "Create token"}
        </button>
      </form>
      {state.error && <p className="-mt-4 text-sm text-red-600">{state.error}</p>}

      {/* Existing tokens. */}
      <div>
        <h2 className="mb-3 text-sm font-medium">Your tokens</h2>
        {tokens.length === 0 ? (
          <p className="text-sm text-muted">No tokens yet.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-line">
            <table className="w-full text-sm">
              <thead className="bg-paper-2 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Created</th>
                  <th className="px-4 py-2 font-medium">Last used</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {tokens.map((t) => (
                  <tr key={t.id} className="border-t border-line">
                    <td className="px-4 py-2">{t.name}</td>
                    <td className="px-4 py-2 text-muted">{fmtDate(t.createdAt)}</td>
                    <td className="px-4 py-2 text-muted">{fmtDate(t.lastUsedAt)}</td>
                    <td className="px-4 py-2 text-right">
                      <form action={revokeToken}>
                        <input type="hidden" name="id" value={t.id} />
                        <button
                          type="submit"
                          className="text-xs text-red-600 hover:underline"
                        >
                          Revoke
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
