import { randomUUID } from "node:crypto";
import Link from "next/link";
import type { Metadata } from "next";
import { T } from "@/components/T";
import { getCurrentUser } from "@/lib/auth";
import { TIER_FEATURE_KEYS, TIER_FEATURE_LABELS, type TierKey } from "@/lib/pricing";
import { getSettings, planAllowanceMinutes, type SubscriptionPlan } from "@/lib/settings";
import {
  getActiveSubscription,
  isSubscriptionBypassed,
  remainingMinutes,
} from "@/lib/subscriptions";
import { getTranscriptionRoutingInfo } from "@/lib/transcription-models";

const description =
  "Compare Transcribe plan prices, monthly audio allowances, model routes, and renewal terms.";

export const metadata: Metadata = {
  title: "Plans",
  description,
  alternates: { canonical: "/plans" },
  openGraph: { title: "Transcribe plans", description, url: "/plans" },
};
export const dynamic = "force-dynamic";

function allowance(minutes: number): string {
  const hours = minutes / 60;
  if (hours >= 1) return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} hours`;
  return `${minutes} minutes`;
}

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)} USD`;
}

function commitment(plan: SubscriptionPlan): string {
  if (plan.interval === "week") return "One payment · access ends after 7 days";
  if (plan.interval === "year") {
    return `Charged yearly · about $${(plan.priceUsdCents / 1200).toFixed(2)}/month`;
  }
  return "Charged monthly";
}

function IncludedIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="mt-0.5 size-4 shrink-0 text-success"
      fill="none"
    >
      <path d="m3 8.25 3 3L13 4.5" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

export default async function PlansPage({
  searchParams,
}: {
  searchParams: Promise<{ subscribed?: string; canceled?: string }>;
}) {
  const user = await getCurrentUser();
  const settings = await getSettings();
  const rawSub = user ? await getActiveSubscription(user.id) : null;
  const sub = isSubscriptionBypassed(user, settings) ? null : rawSub;
  const params = await searchParams;
  const routing = getTranscriptionRoutingInfo();
  const taxEnabled = process.env.STRIPE_AUTOMATIC_TAX === "1";

  if (!settings.subscriptionsEnabled) {
    return (
      <div className="py-12">
        <h1 className="page-title">Subscription plans</h1>
        <p className="page-intro">Subscriptions are not available right now.</p>
        <Link href="/credits" className="button-primary mt-6 inline-flex">Buy pay-as-you-go credits</Link>
      </div>
    );
  }

  const activePlan = sub
    ? settings.subscriptionPlans.find((plan) => plan.id === sub.planId)
    : undefined;

  return (
    <div className="py-12">
      <header className="max-w-3xl">
        <p className="eyebrow">Pricing with explicit limits</p>
        <h1 className="page-title"><T id="plans.heading" /></h1>
        <p className="page-intro"><T id="plans.subheading" /></p>
      </header>

      {params.subscribed && (
        <p role="status" className={`${sub ? "status-success" : "status-info"} mt-6`}>
          {sub
            ? "Payment confirmed. Your plan is active."
            : "Checkout finished and payment confirmation is still processing. Refresh shortly; no allowance is shown until Stripe confirms payment."}
        </p>
      )}
      {params.canceled && (
        <p role="status" className="status-info mt-6">Checkout was closed. No plan change was made here.</p>
      )}

      {sub && activePlan && (
        <section aria-labelledby="active-plan" className="mt-8 border-y border-line py-5">
          <h2 id="active-plan" className="font-semibold">Current plan: {activePlan.label}</h2>
          <p className="mt-1 text-sm text-muted">
            {allowance(remainingMinutes(sub))} of {allowance(sub.allowanceMinutes)} remain ·
            allowance resets {sub.allowancePeriodEnd.toISOString().slice(0, 10)} ·
            {sub.cancelAtPeriodEnd ? " access ends " : " renews "}{sub.periodEnd.toISOString().slice(0, 10)}
          </p>
          <Link href="/account" className="text-link mt-3 inline-flex">Manage renewal and billing</Link>
        </section>
      )}

      <div className="mt-10 space-y-12">
        {(["standard", "premium"] as TierKey[]).map((tier) => {
          const route = routing.routes.find((candidate) => candidate.assumptionTier === tier);
          const plans = settings.subscriptionPlans.filter((plan) => plan.tier === tier);
          return (
            <section key={tier} aria-labelledby={`${tier}-plans`}>
              <div className="grid gap-3 border-b border-line pb-5 md:grid-cols-[1fr_1fr] md:items-end">
                <div>
                  <p className="eyebrow">{tier === "standard" ? "Everyday transcription" : "Meetings and conversations"}</p>
                  <h2 id={`${tier}-plans`} className="section-title">{settings.tiers[tier].label}</h2>
                  <p className="mt-2 max-w-2xl text-sm text-muted">{settings.tiers[tier].description}</p>
                </div>
                <dl className="text-sm md:justify-self-end">
                  <div className="flex gap-2"><dt className="text-muted">Provider/model:</dt><dd>{route?.provider} {route?.model}</dd></div>
                  <div className="mt-1 flex gap-2"><dt className="text-muted">Speaker labels:</dt><dd>{settings.tierFeatures[tier].speakerLabels ? "Available when selected" : "Not available"}</dd></div>
                </dl>
              </div>

              <div className="mt-5 grid gap-px overflow-hidden border border-line bg-line lg:grid-cols-3">
                {plans.map((plan) => {
                  const isActive = sub?.planId === plan.id;
                  const planAllowance = planAllowanceMinutes(plan, settings);
                  return (
                    <article key={plan.id} className="flex flex-col bg-paper p-6">
                      <h3 className="font-semibold">{plan.label}</h3>
                      <p className="mt-3 text-3xl font-semibold tracking-tight">{money(plan.priceUsdCents)}</p>
                      <p className="mt-1 text-sm text-muted">{commitment(plan)}</p>
                      <p className="mt-5 font-medium">{allowance(planAllowance)} per {plan.interval === "week" ? "7-day pass" : "month"}</p>
                      <p className="mt-1 text-sm text-muted">
                        {plan.interval === "year"
                          ? "The allowance resets monthly; the annual price is paid upfront."
                          : plan.interval === "month"
                            ? "The allowance resets on the monthly renewal date."
                            : "The allowance applies once and does not renew."}
                        {" "}Unused allowance does not roll over.
                      </p>
                      <ul className="mt-5 space-y-2 text-sm">
                        {TIER_FEATURE_KEYS.filter((feature) => settings.tierFeatures[tier][feature]).map((feature) => (
                          <li key={feature} className="flex gap-2">
                            <IncludedIcon />
                            <span>{TIER_FEATURE_LABELS[feature]}</span>
                          </li>
                        ))}
                        {tier === "premium" && (
                          <li className="flex gap-2">
                            <IncludedIcon />
                            <span>Also covers Standard jobs</span>
                          </li>
                        )}
                      </ul>
                      <div className="mt-auto pt-6">
                        {sub ? (
                          <Link href="/account" className="button-secondary flex w-full justify-center">
                            {isActive ? "Manage current plan" : "Manage plan before switching"}
                          </Link>
                        ) : user ? (
                          <form action="/api/subscribe" method="POST">
                            <input type="hidden" name="planId" value={plan.id} />
                            <input type="hidden" name="checkoutAttempt" value={randomUUID()} />
                            <button type="submit" className="button-primary w-full">
                              {plan.interval === "week" ? `Buy ${plan.label}` : `Subscribe to ${plan.label}`}
                            </button>
                          </form>
                        ) : (
                          <Link href="/login?next=%2Fplans" className="button-primary flex w-full justify-center">
                            Sign in to choose {plan.label}
                          </Link>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <aside className="mt-12 max-w-3xl border-t border-line pt-6 text-sm text-muted">
        <h2 className="font-semibold text-ink">Before checkout</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Prices are in USD. {taxEnabled ? "Applicable tax is calculated and shown by Stripe before payment." : "Tax automation is not configured; confirm the total shown by Stripe before paying."}</li>
          <li>Monthly and annual plans renew automatically until canceled. Cancel from Account; access remains through the paid period.</li>
          <li>Week passes are one-time purchases and do not renew.</li>
          <li>When a job crosses the remaining allowance, the excess uses backup credits only after you confirm the cost.</li>
          <li>Automatic transcripts and speaker labels can be wrong; review names, numbers, and important quotations.</li>
        </ul>
        <p className="mt-4"><Link href="/billing" className="text-link">Full billing and refund information</Link></p>
      </aside>

      <p className="mt-8 text-sm text-muted"><T id="plans.payg" /> <Link href="/credits" className="text-link"><T id="plans.paygLink" /></Link>.</p>
    </div>
  );
}
