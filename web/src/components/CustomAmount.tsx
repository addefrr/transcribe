"use client";

import { useState } from "react";

export default function CustomAmount({
  usdCentsPerCredit,
  minPurchaseUsdCents,
  disabled = false,
  checkoutAttempt,
}: {
  usdCentsPerCredit: number;
  minPurchaseUsdCents: number;
  disabled?: boolean;
  checkoutAttempt: string;
}) {
  const [dollars, setDollars] = useState("");
  const cents = Math.round(Number(dollars) * 100);
  const valid = Number.isFinite(cents) && cents >= minPurchaseUsdCents;
  const credits = valid ? Math.floor(cents / usdCentsPerCredit) : 0;
  const minDollars = (minPurchaseUsdCents / 100).toFixed(2);

  return (
    <form
      action="/api/stripe/checkout"
      method="POST"
      className="rounded-xl border border-line p-6"
      onSubmit={(e) => {
        if (!valid) e.preventDefault();
      }}
    >
      <h3 className="font-semibold">Choose your own amount</h3>
      <input type="hidden" name="checkoutAttempt" value={checkoutAttempt} />
      <p className="mt-1 text-sm text-muted">
        Buy exactly what you need — minimum ${minDollars}.
      </p>
      <label htmlFor="custom-credit-amount" className="field-label mt-4">Amount in US dollars</label>
      <div className="mt-1 flex items-center gap-2">
        <span className="text-lg text-muted">$</span>
        <input
          name="customUsdCents_display"
          id="custom-credit-amount"
          type="number"
          min={minDollars}
          step="0.01"
          inputMode="decimal"
          value={dollars}
          onChange={(e) => setDollars(e.target.value)}
          placeholder={minDollars}
          disabled={disabled}
          aria-describedby="custom-credit-help"
          className="field-input w-32"
        />
        {/* Submit cents so the server never has to parse dollars/locale. */}
        <input type="hidden" name="customUsdCents" value={valid ? cents : ""} />
      </div>
      <p id="custom-credit-help" role="status" className="mt-3 min-h-5 text-sm text-muted">
        {dollars && !valid
          ? `Minimum is $${minDollars}.`
          : credits > 0
            ? `You'll get ${credits.toLocaleString()} credits.`
            : ""}
      </p>
      <button
        type="submit"
        disabled={disabled || !valid}
        className="button-primary mt-3 w-full"
      >
        {valid ? `Buy for $${(cents / 100).toFixed(2)}` : "Enter an amount"}
      </button>
    </form>
  );
}
