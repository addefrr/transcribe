"use client";

import { useActionState } from "react";
import {
  cancelSubscriptionAction,
  deleteAccountAction,
  resumeSubscriptionAction,
  type AccountActionState,
} from "./actions";

export function SubscriptionControls({ cancelAtPeriodEnd }: { cancelAtPeriodEnd: boolean }) {
  const action = cancelAtPeriodEnd ? resumeSubscriptionAction : cancelSubscriptionAction;
  const [state, formAction, pending] = useActionState(
    async (_previous: AccountActionState): Promise<AccountActionState> => {
      void _previous;
      return action();
    },
    {},
  );
  return (
    <form
      action={formAction}
      className="mt-4"
    >
      <button
        type="submit"
        disabled={pending}
        className="button-secondary"
        onClick={(event) => {
          if (
            !cancelAtPeriodEnd &&
            !window.confirm("Cancel automatic renewal? Your access continues through the paid period.")
          ) event.preventDefault();
        }}
      >
        {pending
          ? (cancelAtPeriodEnd ? "Restoring renewal…" : "Canceling renewal…")
          : (cancelAtPeriodEnd ? "Keep automatic renewal" : "Cancel automatic renewal")}
      </button>
      {state.notice && <p role="status" className="status-success mt-3">{state.notice}</p>}
      {state.error && <p role="alert" className="status-error mt-3">{state.error}</p>}
    </form>
  );
}

export function DeleteAccountForm() {
  const [state, formAction, pending] = useActionState(deleteAccountAction, {});
  return (
    <form action={formAction} className="mt-5 max-w-md space-y-4">
      <div>
        <label htmlFor="delete-password" className="field-label">Current password</label>
        <input
          id="delete-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={256}
          aria-invalid={Boolean(state.fieldErrors?.password)}
          aria-describedby={state.fieldErrors?.password ? "delete-password-error" : undefined}
          className="field-input"
        />
        {state.fieldErrors?.password && (
          <p id="delete-password-error" className="field-error">{state.fieldErrors.password}</p>
        )}
      </div>
      <div>
        <label htmlFor="delete-confirmation" className="field-label">Type DELETE to confirm</label>
        <input
          id="delete-confirmation"
          name="confirmation"
          required
          autoComplete="off"
          aria-invalid={Boolean(state.fieldErrors?.confirmation)}
          aria-describedby={state.fieldErrors?.confirmation ? "delete-confirmation-error" : undefined}
          className="field-input"
        />
        {state.fieldErrors?.confirmation && (
          <p id="delete-confirmation-error" className="field-error">{state.fieldErrors.confirmation}</p>
        )}
      </div>
      {state.error && <p role="alert" className="status-error">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="button-danger"
        onClick={(event) => {
          if (!window.confirm("Permanently delete your account, transcripts, shares, tokens, and retained media?")) {
            event.preventDefault();
          }
        }}
      >
        {pending ? "Deleting account…" : "Permanently delete account"}
      </button>
    </form>
  );
}
