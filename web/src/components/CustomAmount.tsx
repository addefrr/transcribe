"use client";

import { useState } from "react";

export default function CustomAmount({
  usdCentsPerCredit,
  minPurchaseUsdCents,
}: {
  usdCentsPerCredit: number;
  minPurchaseUsdCents: number;
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
      className="rounded-xl border border-zinc-200 p-6 dark:border-zinc-800"
      onSubmit={(e) => {
        if (!valid) e.preventDefault();
      }}
    >
      <h3 className="font-semibold">Choose your own amount</h3>
      <p className="mt-1 text-sm text-zinc-500">
        Buy exactly what you need — minimum ${minDollars}.
      </p>
      <div className="mt-4 flex items-center gap-2">
        <span className="text-lg text-zinc-500">$</span>
        <input
          name="customUsdCents_display"
          type="number"
          min={minDollars}
          step="0.01"
          inputMode="decimal"
          value={dollars}
          onChange={(e) => setDollars(e.target.value)}
          placeholder={minDollars}
          className="w-28 rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-zinc-700"
        />
        {/* Submit cents so the server never has to parse dollars/locale. */}
        <input type="hidden" name="customUsdCents" value={valid ? cents : ""} />
      </div>
      <p className="mt-3 h-5 text-sm text-zinc-600 dark:text-zinc-400">
        {dollars && !valid
          ? `Minimum is $${minDollars}.`
          : credits > 0
            ? `You'll get ${credits.toLocaleString()} credits.`
            : ""}
      </p>
      <button
        type="submit"
        disabled={!valid}
        className="mt-3 w-full rounded-md bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
      >
        {valid ? `Buy for $${(cents / 100).toFixed(2)}` : "Enter an amount"}
      </button>
    </form>
  );
}
