import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin";
import { getCurrentUser } from "@/lib/auth";
import { TIER_KEYS } from "@/lib/pricing";
import { getSettings } from "@/lib/settings";
import { saveSettings } from "./actions";

export const metadata = { title: "Settings — Transcribe" };
export const dynamic = "force-dynamic";

const field =
  "w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-zinc-700";
const labelCls = "block text-xs text-zinc-500";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const user = await getCurrentUser();
  if (!isAdmin(user)) redirect("/dashboard");
  const s = await getSettings();
  const { saved } = await searchParams;

  return (
    <div className="py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <Link href="/developer" className="text-sm text-indigo-600 hover:underline dark:text-indigo-400">
          ← Back to portal
        </Link>
      </div>
      <p className="mt-1 text-sm text-zinc-500">
        Changes apply within a few seconds and never affect jobs already in progress.
      </p>
      {saved && (
        <p className="mt-4 rounded-md bg-green-100 px-4 py-2 text-sm text-green-800 dark:bg-green-950 dark:text-green-300">
          Saved.
        </p>
      )}

      <form action={saveSettings} className="mt-8 space-y-10">
        {/* Quality tiers */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Quality tiers
          </h2>
          <div className="mt-3 grid gap-6 sm:grid-cols-2">
            {TIER_KEYS.map((key) => (
              <div key={key} className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
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
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Credit packs
          </h2>
          <div className="mt-3 grid gap-6 sm:grid-cols-3">
            {s.packs.map((pack) => (
              <div key={pack.id} className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
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
                <p className="mt-1 text-xs text-zinc-400">
                  = ${(pack.amountUsdCents / 100).toFixed(2)} today
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Credits economics */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Credits &amp; purchases
          </h2>
          <div className="mt-3 grid max-w-2xl gap-6 sm:grid-cols-3">
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
              <p className="mt-1 text-xs text-zinc-400">for custom-amount purchases</p>
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
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Subscriptions
          </h2>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="subscriptionsEnabled"
              defaultChecked={s.subscriptionsEnabled}
            />
            Offer subscriptions
          </label>
          <div className="mt-4 grid max-w-md gap-6 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Standard compute cost (¢/min)</label>
              <input
                name="cost_standard"
                type="number"
                step="0.001"
                min={0.001}
                defaultValue={s.costPerMinuteCents.standard}
                className={field}
              />
            </div>
            <div>
              <label className={labelCls}>Premium compute cost (¢/min)</label>
              <input
                name="cost_premium"
                type="number"
                step="0.001"
                min={0.001}
                defaultValue={s.costPerMinuteCents.premium}
                className={field}
              />
            </div>
          </div>
          <p className="mt-2 text-xs text-zinc-400">
            Fair-use allowance = plan price × cap% ÷ compute cost. Higher compute cost or lower
            cap = fewer included minutes.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {s.subscriptionPlans.map((plan) => (
              <div key={plan.id} className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
                <p className="text-xs uppercase tracking-wide text-zinc-400">
                  {plan.tier} · {plan.interval}
                </p>
                <label className={`${labelCls} mt-2`}>Label</label>
                <input name={`plan_${plan.id}_label`} defaultValue={plan.label} className={field} />
                <label className={`${labelCls} mt-3`}>Price (US cents)</label>
                <input
                  name={`plan_${plan.id}_cents`}
                  type="number"
                  min={50}
                  defaultValue={plan.priceUsdCents}
                  className={field}
                />
                <label className={`${labelCls} mt-3`}>Fair-use cap (% of price)</label>
                <input
                  name={`plan_${plan.id}_cap`}
                  type="number"
                  min={1}
                  max={100}
                  defaultValue={plan.capPct}
                  className={field}
                />
              </div>
            ))}
          </div>
        </section>

        {/* Spend wallet */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Spend wallet
          </h2>
          <div className="mt-3 max-w-xs">
            <label className={labelCls}>Max spend (% of revenue)</label>
            <input
              name="walletSpendPct"
              type="number"
              min={1}
              max={100}
              defaultValue={s.walletSpendPct}
              className={field}
            />
            <p className="mt-1 text-xs text-zinc-400">
              New transcriptions are paused once estimated API spend reaches this share of your
              total revenue.
            </p>
          </div>
        </section>

        <button
          type="submit"
          className="rounded-md bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-indigo-500"
        >
          Save changes
        </button>
      </form>
    </div>
  );
}
