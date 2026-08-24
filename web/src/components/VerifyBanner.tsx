"use client";

import { useActionState } from "react";
import { resendVerification } from "@/app/(auth)/actions";
import { T } from "@/components/T";

// Shown to signed-in users who have not verified their address. Verification is
// also the point at which the configured trial-credit grant is applied.
export default function VerifyBanner({ bonusCredits }: { bonusCredits: number }) {
  const [state, formAction, pending] = useActionState(resendVerification, {});
  const message = state.error ? (
    state.error
  ) : state.notice ? (
    state.notice
  ) : bonusCredits > 0 ? (
    <T id="auth.verifyBannerBonus" vars={{ credits: bonusCredits }} />
  ) : (
    <T id="auth.verifyBanner" />
  );

  return (
    <div className="border-b border-line bg-paper-2">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm sm:px-6">
        <p
          role={state.error ? "alert" : "status"}
          aria-live={state.error ? "assertive" : "polite"}
          className={state.error ? "text-danger" : "text-muted"}
        >
          {message}
        </p>
        {!state.notice && (
          <form action={formAction} aria-busy={pending}>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex min-h-11 items-center font-semibold text-brand hover:underline disabled:cursor-wait disabled:opacity-60"
            >
              {pending ? <T id="auth.sendingVerification" /> : <T id="auth.verifyResend" />}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
