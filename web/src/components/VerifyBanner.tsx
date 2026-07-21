"use client";

import { useActionState } from "react";
import { useContent } from "@/components/ContentProvider";
import { resendVerification } from "@/app/(auth)/actions";

// Shown to signed-in users who haven't verified their email yet. Non-blocking —
// it just nudges, with a one-click resend.
export default function VerifyBanner() {
  const [state, formAction, pending] = useActionState(resendVerification, {});
  const t = useContent().auth;
  return (
    <div className="border-b border-line bg-paper-2">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm sm:px-6">
        <span className="text-muted">{state.notice ?? t.verifyBanner}</span>
        {!state.notice && (
          <form action={formAction}>
            <button
              type="submit"
              disabled={pending}
              className="font-medium text-brand hover:underline disabled:opacity-50"
            >
              {pending ? "Sending…" : t.verifyResend}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
