"use client";

import { useActionState, useState } from "react";
import { CONTENT_NAMESPACES, type Content } from "@/lib/content";
import {
  costPerHourUsd,
  TIER_FEATURE_KEYS,
  TIER_FEATURE_LABELS,
  TIER_KEYS,
} from "@/lib/pricing";
import type { Settings } from "@/lib/settings";
import { saveSettings, type SettingsActionState } from "./actions";

function hoursLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const value = minutes / 60;
  return `${Number.isInteger(value) ? value : value.toFixed(1)} hours`;
}

const field =
  "min-h-11 w-full rounded-md border border-line bg-transparent px-3 py-2 text-base sm:text-sm";
const labelCls = "mb-1.5 block text-sm font-medium text-ink";

function settingId(name: string): string {
  return `setting-${name.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

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
  const [state, formAction, pending] = useActionState<SettingsActionState, FormData>(
    saveSettings,
    {},
  );

  // Controlled state for provider cost reporting and explicit plan promises.
  const [costHour, setCostHour] = useState({
    standard: costPerHourUsd(s.costPerMinuteCents.standard),
    premium: costPerHourUsd(s.costPerMinuteCents.premium),
  });
  const [planVals, setPlanVals] = useState<Record<string, { price: number; allowance: number }>>(
    Object.fromEntries(
      s.subscriptionPlans.map((p) => [
        p.id,
        { price: p.priceUsdCents, allowance: p.allowanceMinutes },
      ]),
    ),
  );
  const allowanceSourceId = (planId: string): string => {
    const plan = s.subscriptionPlans.find((candidate) => candidate.id === planId);
    if (plan?.interval !== "year") return planId;
    return (
      s.subscriptionPlans.find(
        (candidate) => candidate.tier === plan.tier && candidate.interval === "month",
      )?.id ?? planId
    );
  };
  const previewHours = (planId: string): string => {
    return hoursLabel(planVals[allowanceSourceId(planId)].allowance);
  };

  return (
    <form action={formAction} aria-busy={pending} className="mt-6">
      <div
        className="sticky top-14 z-10 -mx-1 flex flex-wrap gap-1.5 border-b border-line bg-paper/90 px-1 py-3 backdrop-blur"
        role="group"
        aria-label="Settings sections"
      >
        {categories.map((c) => (
          <button
            key={c.id}
            id={`settings-tab-${c.id}`}
            type="button"
            aria-controls={`settings-panel-${c.id}`}
            aria-pressed={active === c.id}
            onClick={() => setActive(c.id)}
            className={`tap-target rounded-md border px-3 text-sm transition ${
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
        <section
          id="settings-panel-tiers"
          aria-labelledby="settings-tab-tiers"
          hidden={active !== "tiers"}
        >
          <div className="grid gap-6 sm:grid-cols-2">
            {TIER_KEYS.map((key) => (
              <div key={key} className="rounded-xl border border-line p-5">
                <h3 className="mb-3 font-medium capitalize">{key}</h3>
                <label htmlFor={settingId(`tier_${key}_label`)} className={labelCls}>
                  Label
                </label>
                <input
                  id={settingId(`tier_${key}_label`)}
                  name={`tier_${key}_label`}
                  defaultValue={s.tiers[key].label}
                  className={field}
                />
                <label htmlFor={settingId(`tier_${key}_cpm`)} className={`${labelCls} mt-3`}>
                  Credits per minute
                </label>
                <input
                  id={settingId(`tier_${key}_cpm`)}
                  name={`tier_${key}_cpm`}
                  type="number"
                  min={1}
                  defaultValue={s.tiers[key].creditsPerMinute}
                  className={field}
                />
                <label htmlFor={settingId(`tier_${key}_desc`)} className={`${labelCls} mt-3`}>
                  Description
                </label>
                <textarea
                  id={settingId(`tier_${key}_desc`)}
                  name={`tier_${key}_desc`}
                  defaultValue={s.tiers[key].description}
                  rows={3}
                  className={field}
                />
                <fieldset className="mt-4 border-t border-line pt-4">
                  <legend className={labelCls}>Included features</legend>
                  <div className="mt-2 space-y-2">
                    {TIER_FEATURE_KEYS.map((feature) => {
                      const unavailable = key === "standard" && feature === "speakerLabels";
                      return (
                        <label
                          key={feature}
                          className={`min-h-11 cursor-pointer items-start gap-2 py-2 text-sm ${unavailable ? "flex text-muted" : "flex"}`}
                        >
                          <input
                            type="checkbox"
                            name={`feature_${key}_${feature}`}
                            defaultChecked={unavailable ? false : s.tierFeatures[key][feature]}
                            disabled={unavailable}
                            className="mt-0.5"
                          />
                          <span>
                            {TIER_FEATURE_LABELS[feature]}
                            {unavailable && (
                              <span className="block text-xs">Groq Turbo does not provide diarization.</span>
                            )}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              </div>
            ))}
          </div>
        </section>

        {/* Credit packs */}
        <section
          id="settings-panel-packs"
          aria-labelledby="settings-tab-packs"
          hidden={active !== "packs"}
        >
          <div className="grid gap-6 sm:grid-cols-3">
            {s.packs.map((pack) => (
              <div key={pack.id} className="rounded-xl border border-line p-5">
                <label htmlFor={settingId(`pack_${pack.id}_name`)} className={labelCls}>
                  Name
                </label>
                <input
                  id={settingId(`pack_${pack.id}_name`)}
                  name={`pack_${pack.id}_name`}
                  defaultValue={pack.name}
                  className={field}
                />
                <label htmlFor={settingId(`pack_${pack.id}_credits`)} className={`${labelCls} mt-3`}>
                  Credits
                </label>
                <input
                  id={settingId(`pack_${pack.id}_credits`)}
                  name={`pack_${pack.id}_credits`}
                  type="number"
                  min={1}
                  defaultValue={pack.credits}
                  className={field}
                />
                <label htmlFor={settingId(`pack_${pack.id}_cents`)} className={`${labelCls} mt-3`}>
                  Price (US cents)
                </label>
                <input
                  id={settingId(`pack_${pack.id}_cents`)}
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
        <section
          id="settings-panel-purchases"
          aria-labelledby="settings-tab-purchases"
          hidden={active !== "purchases"}
        >
          <div className="grid max-w-2xl gap-6 sm:grid-cols-3">
            <div>
              <label htmlFor={settingId("signupBonusCredits")} className={labelCls}>
                Signup bonus (credits)
              </label>
              <input
                id={settingId("signupBonusCredits")}
                name="signupBonusCredits"
                type="number"
                min={0}
                defaultValue={s.signupBonusCredits}
                className={field}
              />
            </div>
            <div>
              <label htmlFor={settingId("usdCentsPerCredit")} className={labelCls}>
                Price per credit (US cents)
              </label>
              <input
                id={settingId("usdCentsPerCredit")}
                name="usdCentsPerCredit"
                type="number"
                min={0.0001}
                step="0.0001"
                defaultValue={s.usdCentsPerCredit}
                aria-describedby="custom-credit-price-help"
                className={field}
              />
              <p id="custom-credit-price-help" className="mt-1 text-xs text-muted">
                For custom-amount purchases.
              </p>
            </div>
            <div>
              <label htmlFor={settingId("minPurchaseUsdCents")} className={labelCls}>
                Minimum purchase (US cents)
              </label>
              <input
                id={settingId("minPurchaseUsdCents")}
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
        <section
          id="settings-panel-subscriptions"
          aria-labelledby="settings-tab-subscriptions"
          hidden={active !== "subscriptions"}
        >
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" name="subscriptionsEnabled" defaultChecked={s.subscriptionsEnabled} />
            Offer subscriptions
          </label>
          <label className="mt-3 flex min-h-11 cursor-pointer items-start gap-2 py-2 text-sm">
            <input
              type="checkbox"
              name="developerSubscriptionBypass"
              defaultChecked={s.developerSubscriptionBypass}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">Ignore my subscription while demoing</span>
              <span className="mt-1 block text-xs text-muted">
                Only applies to accounts listed in ADMIN_EMAILS. It makes your account look and bill
                like it has no active subscription; customer subscriptions stay untouched.
              </span>
            </span>
          </label>
          <div className="mt-4 grid max-w-md gap-6 sm:grid-cols-2">
            <div>
              <label htmlFor={settingId("cost_standard")} className={labelCls}>
                What it costs us — Standard ($/hour of audio)
              </label>
              <input
                id={settingId("cost_standard")}
                name="cost_standard"
                type="number"
                step="0.0001"
                min={0}
                value={costHour.standard}
                aria-describedby="provider-cost-help"
                onChange={(e) => setCostHour((c) => ({ ...c, standard: Number(e.target.value) }))}
                className={field}
              />
            </div>
            <div>
              <label htmlFor={settingId("cost_premium")} className={labelCls}>
                What it costs us — Premium ($/hour of audio)
              </label>
              <input
                id={settingId("cost_premium")}
                name="cost_premium"
                type="number"
                step="0.0001"
                min={0}
                value={costHour.premium}
                aria-describedby="provider-cost-help"
                onChange={(e) => setCostHour((c) => ({ ...c, premium: Number(e.target.value) }))}
                className={field}
              />
            </div>
          </div>
          <p id="provider-cost-help" className="mt-2 text-xs text-muted">
            Enter your own transcription cost per hour of audio (what providers charge you).
            These values are internal cost assumptions only. Customer allowances are explicit
            promises below and do not change when a provider price changes.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {s.subscriptionPlans.map((plan) => {
              const annual = plan.interval === "year";
              const allowanceSource = allowanceSourceId(plan.id);
              return (
              <div key={plan.id} className="rounded-xl border border-line p-5">
                <p className="text-xs uppercase tracking-wide text-muted">
                  {plan.tier} · {plan.interval}
                </p>
                <label htmlFor={settingId(`plan_${plan.id}_label`)} className={`${labelCls} mt-2`}>
                  Label
                </label>
                <input
                  id={settingId(`plan_${plan.id}_label`)}
                  name={`plan_${plan.id}_label`}
                  defaultValue={plan.label}
                  className={field}
                />
                <label htmlFor={settingId(`plan_${plan.id}_cents`)} className={`${labelCls} mt-3`}>
                  Price (US cents)
                </label>
                <input
                  id={settingId(`plan_${plan.id}_cents`)}
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
                <label
                  htmlFor={settingId(`plan_${plan.id}_allowance`)}
                  className={`${labelCls} mt-3`}
                >
                  Included audio ({plan.interval === "week" ? "minutes per pass" : "minutes per monthly reset"})
                </label>
                <input
                  id={settingId(`plan_${plan.id}_allowance`)}
                  name={`plan_${plan.id}_allowance`}
                  type="number"
                  min={1}
                  step={1}
                  value={planVals[allowanceSource].allowance}
                  readOnly={annual}
                  aria-readonly={annual}
                  onChange={(e) =>
                    !annual &&
                    setPlanVals((v) => ({
                      ...v,
                      [plan.id]: { ...v[plan.id], allowance: Number(e.target.value) },
                    }))
                  }
                  aria-describedby={`plan-${plan.id}-allowance-preview`}
                  className={`${field} ${annual ? "cursor-not-allowed bg-paper-2 text-muted" : ""}`}
                />
                <p id={`plan-${plan.id}-allowance-preview`} className="mt-2 text-xs font-medium text-brand">
                  {previewHours(plan.id)} included
                  {plan.interval === "year" ? " each month (annual billing)" : ""}
                </p>
                {annual && (
                  <p className="mt-1 text-xs text-muted">
                    Kept equal to the matching monthly plan. Edit that plan to change both allowances.
                  </p>
                )}
              </div>
              );
            })}
          </div>
        </section>

        {/* Spend wallet */}
        <section
          id="settings-panel-wallet"
          aria-labelledby="settings-tab-wallet"
          hidden={active !== "wallet"}
        >
          <div className="max-w-xs">
            <label htmlFor={settingId("walletSpendPct")} className={labelCls}>
              Max spend (% of recorded payment value)
            </label>
            <input
              id={settingId("walletSpendPct")}
              name="walletSpendPct"
              type="number"
              min={1}
              max={100}
              defaultValue={s.walletSpendPct}
              aria-describedby="wallet-spend-help"
              className={field}
            />
            <p id="wallet-spend-help" className="mt-1 text-xs text-muted">
              New transcriptions are paused once estimated API spend reaches this share of recorded
              credit and subscription payments. This is a safety limit, not a profit calculation.
            </p>
          </div>
        </section>

        {/* Transcription */}
        <section
          id="settings-panel-transcription"
          aria-labelledby="settings-tab-transcription"
          hidden={active !== "transcription"}
        >
          <label className="flex min-h-11 cursor-pointer items-start gap-2 py-2 text-sm">
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
        <section
          id="settings-panel-text"
          aria-labelledby="settings-tab-text"
          hidden={active !== "text"}
        >
          <div
            className="flex flex-wrap gap-1.5 border-b border-line pb-3"
            role="group"
            aria-label="Text groups"
          >
            {CONTENT_NAMESPACES.map((ns) => (
              <button
                key={ns}
                id={`text-group-${ns}`}
                type="button"
                aria-controls={`text-panel-${ns}`}
                aria-pressed={activeText === ns}
                onClick={() => setActiveText(ns)}
                className={`tap-target rounded-md px-3 text-sm transition ${
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
            <div
              key={ns}
              id={`text-panel-${ns}`}
              aria-labelledby={`text-group-${ns}`}
              hidden={activeText !== ns}
              className="mt-4"
            >
              <p className="mb-3 text-xs text-muted">
                Every string in “{prettyNs(ns)}”. {"{placeholders}"} are filled with live values
                (credit counts, durations) — keep them as-is. You can also edit any string in place
                from the site using the “Edit text” button.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                {Object.entries(content[ns]).map(([key, val]) => (
                  <div key={key}>
                    <label htmlFor={settingId(`content.${ns}.${key}`)} className={labelCls}>
                      {key}
                    </label>
                    {val.length > 60 ? (
                      <textarea
                        id={settingId(`content.${ns}.${key}`)}
                        name={`content.${ns}.${key}`}
                        defaultValue={val}
                        rows={3}
                        className={field}
                      />
                    ) : (
                      <input
                        id={settingId(`content.${ns}.${key}`)}
                        name={`content.${ns}.${key}`}
                        defaultValue={val}
                        className={field}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      </div>

      {state.error && (
        <p className="mt-8 max-w-2xl rounded-md bg-danger-soft px-4 py-3 text-sm text-danger" role="alert">
          {state.error}
        </p>
      )}
      <p className="sr-only" role="status" aria-live="polite">
        {pending ? "Saving settings…" : ""}
      </p>
      <button
        type="submit"
        disabled={pending}
        className="tap-target mt-8 rounded-md bg-brand px-6 text-sm font-medium text-brand-ink hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Saving changes…" : "Save changes"}
      </button>
    </form>
  );
}
