"use client";

import { useActionState, useState } from "react";
import { createToken, revokeToken, type TokenState } from "@/app/tokens/actions";
import type { PublicApiToken } from "@/lib/apiTokens";

const field = "field-input w-full";

function fmtDate(d: Date | null): string {
  if (!d) return "never";
  return new Date(d).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function TokenManager({
  tokens,
  emailVerified,
}: {
  tokens: PublicApiToken[];
  emailVerified: boolean;
}) {
  const [state, formAction, pending] = useActionState<TokenState, FormData>(createToken, {});
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);

  async function copy(token: string) {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setCopyError(false);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopyError(true);
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
            <input aria-label="New API token" readOnly value={state.token} onFocus={(event) => event.currentTarget.select()} className={`${field} font-mono`} />
            <button
              type="button"
              onClick={() => copy(state.token!)}
              className="button-primary shrink-0"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <p role={copyError ? "alert" : "status"} className={`mt-2 min-h-5 text-sm ${copyError ? "text-danger" : "text-muted"}`}>
            {copyError ? "Clipboard access was blocked. Select and copy the token field instead." : copied ? "Token copied." : ""}
          </p>
        </div>
      )}

      {/* Create a token. */}
      <form
        action={formAction}
        aria-busy={pending}
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <label className="block flex-1">
          <span className="field-label mb-1">Token name</span>
          <input name="name" placeholder="e.g. My laptop extension" required maxLength={60} disabled={!emailVerified || tokens.length >= 10} className={field} />
        </label>
        <button
          type="submit"
          disabled={pending || !emailVerified || tokens.length >= 10}
          className="button-primary"
        >
          {pending ? "Creating token…" : "Create token"}
        </button>
      </form>
      {!emailVerified && <p role="status" className="status-info">Verify your email before creating an API token.</p>}
      {tokens.length >= 10 && <p role="status" className="status-info">Token limit reached. Revoke one before creating another.</p>}
      {state.error && <p role="alert" className="status-error">{state.error}</p>}

      {/* Existing tokens. */}
      <div>
        <h2 className="mb-3 text-sm font-medium">Your tokens</h2>
        {tokens.length === 0 ? (
          <p className="text-sm text-muted">No tokens yet.</p>
        ) : (
          <div
            role="region"
            aria-label="Personal API tokens"
            tabIndex={0}
            className="overflow-x-auto rounded-xl border border-line"
          >
            <table className="w-full min-w-[36rem] text-sm">
              <caption className="sr-only">Personal API tokens and their last use</caption>
              <thead className="bg-paper-2 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">Name</th>
                  <th scope="col" className="px-4 py-2 font-medium">Created</th>
                  <th scope="col" className="px-4 py-2 font-medium">Last used</th>
                  <th scope="col" className="px-4 py-2">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {tokens.map((t) => (
                  <tr key={t.id} className="border-t border-line">
                    <td className="px-4 py-2">{t.name}</td>
                    <td className="px-4 py-2 text-muted">{fmtDate(t.createdAt)}</td>
                    <td className="px-4 py-2 text-muted">{fmtDate(t.lastUsedAt)}</td>
                    <td className="px-4 py-2 text-right">
                      <form action={revokeToken} onSubmit={(event) => {
                        if (!window.confirm(`Revoke the token “${t.name}”? Anything using it will stop working immediately.`)) event.preventDefault();
                      }}>
                        <input type="hidden" name="id" value={t.id} />
                        <button
                          type="submit"
                          className="inline-flex min-h-11 items-center px-2 text-sm text-danger hover:underline"
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
