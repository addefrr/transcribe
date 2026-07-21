"use client";

import { useState } from "react";
import { CONTENT_NAMESPACES, type Content } from "@/lib/content";
import {
  allowanceMinutes,
  costPerHourUsd,
  costPerMinuteCentsFromHourUsd,
  TIER_KEYS,
} from "@/lib/pricing";
import type { Settings } from "@/lib/settings";
import { saveSettings } from "./actions";

function hoursLabel(minutes: number): string {
  return minutes >= 60 ? `${Math.round(minutes / 60)} hours` : `${minutes} min`;
}

const field =
  "w-full rounded-md border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-brand";
const labelCls = "block text-xs text-muted";

function prettyNs(ns: string): string {
  const spaced = ns.replace(/([A-Z])/g, " $1");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export default function SettingsForm({
  settings: s,
  content,
}: {
  settings: Settings;
  content: Content;
}) {
  const categories = [
    { id: "tiers", label: "Quality tiers" },
    { id: "packs", label: "Credit packs" },
    { id: "purchases", label: "Credits & purchases" },
    { id: "subscriptions", label: "Subscriptions" },
    { id: "wallet", label: "Spend wallet" },
    { id: "transcription", label: "Transcription" },
    { id: "text", label: "Text" },
  ];
  const [active, setActive] = useState(categories[0].id);
  const [activeText, setActiveText] = useState<(typeof CONTENT_NAMESPACES)[number]>(
    CONTENT_NAMESPACES[0],
  );
  const show = (id: string) => (active === id ? "" : "hidden");

  // Controlled state for the fair-use preview: our cost ($/hour) + each plan's
  // price/cap. Lets us show "≈ N hours included" live as the admin edits.
  const [costHour, setCostHour] = useState({
    standard: costPerHourUsd(s.costPerMinuteCents.standard),
    premium: costPerHourUsd(s.costPerMinuteCents.premium),
  });
  const [planVals, setPlanVals] = useState<Record<string, { price: number; cap: number }>>(
    Object.fromEntries(
      s.subscriptionPlans.map((p) => [p.id, { price: p.priceUsdCents, cap: p.capPct }]),
    ),
  );
  const previewHours = (tier: "standard" | "premium", planId: string): string => {
    const pv = planVals[planId];
    const mins = allowanceMinutes(pv.price, pv.cap, costPerMinuteCentsFromHourUsd(costHour[tier]));
    return hoursLabel(mins);
  };

  return (
    <form action={saveSettings} className="mt-6">
      {/* Clickable category nav */}
      <div className="sticky top-14 z-10 -mx-1 flex flex-wrap gap-1.5 border-b border-line bg-paper/90 px-1 py-3 backdrop-blur">
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setActive(c.id)}
            className={`rounded-full border px-3 py-1 text-sm transition ${
              active === c.id
                ? "border-ink bg-paper-2 font-medium"
                : "border-line text-muted hover:border-ink"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {/* Quality tiers */}
        <section className={show("tiers")}>
          <div className="grid gap-6 sm:grid-cols-2">
            {TIER_KEYS.map((key) => (
              <div key={key} className="rounded-xl border border-line p-5">
                <p className="mb-3 font-medium capitalize">{key}</p>
                <label className={labelCls}>Label</label>
                <input name={`tier_${key}_label`} defaultValue={s.tiers[key].label} className={field} />
                <label className={`${labelCls} mt-3`}>Credits per minute</label>
                <input
                  name={`tier_${key}_cpm`}
                  type="number"
                  min={1}
                  defaultValue={s.tiers[key].creditsPerMinute}
                  className={field}
                />
                <label className={`${labelCls} mt-3`}>Description</label>
                <textarea
                  name={`tier_${key}_desc`}
                  defaultValue={s.tiers[key].description}
                  rows={3}
                  className={field}
                />
              </div>
            ))}
          </div>
        </section>

        {/* Credit packs */}
        <section className={show("packs")}>
          <div className="grid gap-6 sm:grid-cols-3">
            {s.packs.map((pack) => (
              <div key={pack.id} className="rounded-xl border border-line p-5">
                <label className={labelCls}>Name</label>
                <input name={`pack_${pack.id}_name`} defaultValue={pack.name} className={field} />
                <label className={`${labelCls} mt-3`}>Credits</label>
                <input
                  name={`pack_${pack.id}_credits`}
                  type="number"
                  min={1}
                  defaultValue={pack.credits}
                  className={field}
                />
                <label className={`${labelCls} mt-3`}>Price (US cents)</label>
                <input
                  name={`pack_${pack.id}_cents`}
                  type="number"
                  min={50}
                  defaultValue={pack.amountUsdCents}
                  className={field}
                />
                <p className="mt-1 text-xs text-muted">
                  = ${(pack.amountUsdCents / 100).toFixed(2)} today
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Credits & purchases */}
        <section className={show("purchases")}>
          <div className="grid max-w-2xl gap-6 sm:grid-cols-3">
            <div>
              <label className={labelCls}>Signup bonus (credits)</label>
              <input
                name="signupBonusCredits"
                type="number"
                min={0}
                defaultValue={s.signupBonusCredits}
                className={field}
              />
            </div>
            <div>
              <label className={labelCls}>Price per credit (US cents)</label>
              <input
                name="usdCentsPerCredit"
                type="number"
                min={0.1}
                step="0.1"
                defaultValue={s.usdCentsPerCredit}
                className={field}
              />
              <p className="mt-1 text-xs text-muted">for custom-amount purchases</p>
            </div>
            <div>
              <label className={labelCls}>Minimum purchase (US cents)</label>
              <input
                name="minPurchaseUsdCents"
                type="number"
                min={50}
                defaultValue={s.minPurchaseUsdCents}
                className={field}
              />
            </div>
          </div>
        </section>

        {/* Subscriptions */}
        <section className={show("subscriptions")}>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="subscriptionsEnabled" defaultChecked={s.subscriptionsEnabled} />
            Offer subscriptions
          </label>
          <div className="mt-4 grid max-w-md gap-6 sm:grid-cols-2">
            <div>
              <label className={labelCls}>What it costs us — Standard ($/hour of audio)</label>
              <input
                name="cost_standard"
                type="number"
                step="0.001"
                min={0}
                value={costHour.standard}
                onChange={(e) => setCostHour((c) => ({ ...c, standard: Number(e.target.value) }))}
                className={field}
              />
            </div>
            <div>
              <label className={labelCls}>What it costs us — Premium ($/hour of audio)</label>
              <input
                name="cost_premium"
                type="number"
                step="0.001"
                min={0}
                value={costHour.premium}
                onChange={(e) => setCostHour((c) => ({ ...c, premium: Number(e.target.value) }))}
                className={field}
              />
            </div>
          </div>
          <p className="mt-2 text-xs text-muted">
            Enter your own transcription cost per hour of audio (what providers charge you).
            Fair-use hours = (plan price ÷ our cost) × cap%. Higher cost or lower cap = fewer
            included hours.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {s.subscriptionPlans.map((plan) => (
              <div key={plan.id} className="rounded-xl border border-line p-5">
                <p className="text-xs uppercase tracking-wide text-muted">
                  {plan.tier} · {plan.interval}
                </p>
                <label className={`${labelCls} mt-2`}>Label</label>
                <input name={`plan_${plan.id}_label`} defaultValue={plan.label} className={field} />
                <label className={`${labelCls} mt-3`}>Price (US cents)</label>
                <input
                  name={`plan_${plan.id}_cents`}
                  type="number"
                  min={50}
                  value={planVals[plan.id].price}
                  onChange={(e) =>
                    setPlanVals((v) => ({
                      ...v,
                      [plan.id]: { ...v[plan.id], price: Number(e.target.value) },
                    }))
                  }
                  className={field}
                />
                <label className={`${labelCls} mt-3`}>Fair-use cap (% of our cost)</label>
                <input
                  name={`plan_${plan.id}_cap`}
                  type="number"
                  min={1}
                  max={100}
                  value={planVals[plan.id].cap}
                  onChange={(e) =>
                    setPlanVals((v) => ({
                      ...v,
                      [plan.id]: { ...v[plan.id], cap: Number(e.target.value) },
                    }))
                  }
                  className={field}
                />
                <p className="mt-2 text-xs font-medium text-brand">
                  ≈ {previewHours(plan.tier as "standard" | "premium", plan.id)} included
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Spend wallet */}
        <section className={show("wallet")}>
          <div className="max-w-xs">
            <label className={labelCls}>Max spend (% of revenue)</label>
            <input
              name="walletSpendPct"
              type="number"
              min={1}
              max={100}
              defaultValue={s.walletSpendPct}
              className={field}
            />
            <p className="mt-1 text-xs text-muted">
              New transcriptions are paused once estimated API spend reaches this share of your total
              revenue.
            </p>
          </div>
        </section>

        {/* Transcription */}
        <section className={show("transcription")}>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="reuseTranscripts"
              defaultChecked={s.reuseTranscripts}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">Reuse transcripts for repeat videos</span>
              <span className="mt-1 block text-xs text-muted">
                When a platform video (YouTube, etc.) has already been transcribed at the same
                quality, speaker-labels and language, reuse that transcript instead of transcribing
                again. The customer is still charged normally. Turn off to force a fresh
                transcription while testing.
              </span>
            </span>
          </label>
        </section>

        {/* Site text — one category, with a subcategory per content namespace */}
        <section className={show("text")}>
          <div className="flex flex-wrap gap-1.5 border-b border-line pb-3">
            {CONTENT_NAMESPACES.map((ns) => (
              <button
                key={ns}
                type="button"
                onClick={() => setActiveText(ns)}
                className={`rounded-md px-2.5 py-1 text-xs transition ${
                  activeText === ns
                    ? "bg-paper-2 font-medium text-ink"
                    : "text-muted hover:text-ink"
                }`}
              >
                {prettyNs(ns)}
              </button>
            ))}
          </div>
          {CONTENT_NAMESPACES.map((ns) => (
            <div key={ns} className={activeText === ns ? "mt-4" : "hidden"}>
              <p className="mb-3 text-xs text-muted">
                Every string in “{prettyNs(ns)}”. {"{placeholders}"} are filled with live values
                (credit counts, durations) — keep them as-is. You can also edit any string in place
                from the site using the “Edit text” button.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                {Object.entries(content[ns]).map(([key, val]) => (
                  <div key={key}>
                    <label className={labelCls}>{key}</label>
                    {val.length > 60 ? (
                      <textarea
                        name={`content.${ns}.${key}`}
                        defaultValue={val}
                        rows={3}
                        className={field}
                      />
                    ) : (
                      <input name={`content.${ns}.${key}`} defaultValue={val} className={field} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      </div>

      <button
        type="submit"
        className="mt-8 rounded-md bg-brand px-6 py-2.5 text-sm font-medium text-brand-ink hover:opacity-90"
      >
        Save changes
      </button>
    </form>
  );
}
