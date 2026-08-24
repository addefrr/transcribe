import Link from "next/link";
import { redirect } from "next/navigation";
import { T } from "@/components/T";
import { getCurrentUser } from "@/lib/auth";
import { getAdminStats, isAdmin } from "@/lib/admin";
import { costPerHourUsd } from "@/lib/pricing";
import { getSettings } from "@/lib/settings";
import {
  getTranscriptionRoutingInfo,
  TRANSCRIPTION_PRICING_VERIFIED_ON,
  type TranscriptionRouteInfo,
} from "@/lib/transcription-models";
import { getWallet } from "@/lib/wallet";

export const metadata = { title: "Developer portal" };
export const dynamic = "force-dynamic";

const usd = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
// Per-credit values are sub-cent; show as cents with 3 decimals (e.g. "4.800¢").
const cents = (c: number) => `${c.toFixed(4)}¢`;
const hours = (seconds: number) => (seconds / 3600).toFixed(1);

function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "green" | "red";
}) {
  const color =
    accent === "green"
      ? "text-success"
      : accent === "red"
        ? "text-danger"
        : "text-ink";
  return (
    <div className="rounded-xl border border-line p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </div>
  );
}

function ModelCard({
  route,
  configuredCost,
}: {
  route: TranscriptionRouteInfo;
  configuredCost: number;
}) {
  return (
    <article className="flex flex-col rounded-xl border border-line p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-brand/15 px-2.5 py-1 text-xs font-semibold text-brand">
          {route.tier}
        </span>
        <span className="text-xs text-muted">{route.role}</span>
      </div>
      <p className="mt-4 text-sm text-muted">{route.provider}</p>
      <p className="mt-1 break-all font-mono text-sm font-semibold text-ink">{route.model}</p>
      <p className="mt-4 text-2xl font-bold text-ink">{route.publishedCost}</p>
      <p className="mt-1 text-xs leading-5 text-muted">{route.costDetail}</p>
      <dl className="mt-4 space-y-3 border-t border-line pt-4 text-xs">
        <div>
          <dt className="text-muted">When it is used</dt>
          <dd className="mt-1 leading-5 text-ink">{route.routing}</dd>
        </div>
        <div>
          <dt className="text-muted">Configured internal assumption</dt>
          <dd className="mt-1 font-semibold text-ink">${configuredCost.toFixed(4)} / audio hour</dd>
        </div>
      </dl>
      {route.warning && (
        <p className="status-warning mt-4">
          {route.warning}
        </p>
      )}
      <a
        href={route.sourceUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-auto pt-4 text-xs font-medium text-brand hover:underline"
      >
        {route.sourceLabel} ↗
      </a>
    </article>
  );
}

export default async function DeveloperPage() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) redirect("/dashboard");
  const s = await getAdminStats();
  const wallet = await getWallet();
  const settings = await getSettings();
  const transcription = getTranscriptionRoutingInfo();
  const configuredCosts = {
    standard: costPerHourUsd(settings.costPerMinuteCents.standard),
    premium: costPerHourUsd(settings.costPerMinuteCents.premium),
  };

  return (
    <div className="py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          <T id="developer.portalTitle" />
        </h1>
        <Link
          href="/developer/settings"
          className="inline-flex min-h-11 items-center rounded-md border border-line px-4 py-2 text-sm font-medium hover:border-brand"
        >
          <T id="developer.settings" />
        </Link>
      </div>
      <p className="mt-1 text-sm text-muted">
        Business overview. New Stripe records are tax-exclusive when Stripe supplies enough tax
        detail; historical or fallback records can include tax. Contribution subtracts recorded
        transcription estimates and a configured Stripe estimate ({s.assumptions.stripeFeePct}% +{" "}
        {s.assumptions.stripeFeeFixedCents}¢ per payment). The fee estimate is applied to the recorded
        value and can understate fees when tax is collected. Figures exclude collected tax, refunds,
        chargebacks, currency conversion, storage, hosting, support, payroll, and other overhead.
      </p>

      {/* Models and provider pricing */}
      <div className="mt-8 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            <T id="developer.modelsHeading" />
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            <T id="developer.modelsIntro" />
          </p>
        </div>
        <p className="text-xs text-muted">
          Verified {TRANSCRIPTION_PRICING_VERIFIED_ON}
        </p>
      </div>
      {transcription.forcedBackend && (
        <p className="mt-3 rounded-md border border-line bg-paper-2 px-4 py-3 text-sm">
          Runtime override active: <code className="font-semibold">TRANSCRIBE_BACKEND={transcription.forcedBackend}</code>.
          All jobs on this deployment bypass the default hosted routes shown below.
        </p>
      )}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {transcription.routes.map((route) => (
          <ModelCard
            key={`${route.tier}-${route.role}`}
            route={route}
            configuredCost={configuredCosts[route.assumptionTier]}
          />
        ))}
      </div>
      <p className="mt-3 text-xs leading-5 text-muted">
        Prices exclude discounts, taxes, storage, network transfer, and self-hosted compute. API
        providers bill audio duration rather than processing wall time. Internal assumptions are
        editable in{" "}
        <Link href="/developer/settings" className="text-brand underline underline-offset-4">
          Settings
        </Link>
        .
      </p>

      {/* Money */}
      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-muted">
        <T id="developer.revenueHeading" />
      </h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Recorded pre-tax payment value"
          value={usd(s.revenueCents)}
          sub={`${s.paymentCount} credit and subscription payments`}
        />
        <Stat
          label="Estimated contribution"
          value={usd(s.contributionCents)}
          sub={`${s.contributionMarginPct.toFixed(1)}% before untracked costs`}
          accent={s.contributionCents >= 0 ? "green" : "red"}
        />
        <Stat
          label="Stripe fees (est.)"
          value={usd(s.stripeFeesCents)}
          accent="red"
        />
        <Stat
          label="Transcription cost (est.)"
          value={usd(s.transcriptionCostCents)}
          accent="red"
        />
      </div>

      {/* Spend wallet */}
      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-muted">
        <T id="developer.walletHeading" />
      </h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Recorded pre-tax value in wallet" value={usd(wallet.revenueCents)} />
        <Stat
          label={`Spend budget (${wallet.spendPct}%)`}
          value={usd(wallet.budgetCents)}
        />
        <Stat label="Spent on transcription" value={usd(wallet.spentCents)} accent="red" />
        <Stat
          label={wallet.overBudget ? "Over budget — paused" : "Budget remaining"}
          value={usd(wallet.remainingCents)}
          accent={wallet.overBudget ? "red" : "green"}
          sub={wallet.overBudget ? "new jobs paused until revenue grows" : undefined}
        />
      </div>

      {/* Per-credit economics */}
      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-muted">
        <T id="developer.unitHeading" />
      </h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Avg. price / credit" value={cents(s.pricePerCredit)} />
        <Stat label="Stripe fee / credit" value={cents(s.feePerCredit)} accent="red" />
        <Stat label="Compute / credit" value={cents(s.costPerCredit)} accent="red" />
        <Stat
          label="Contribution / credit"
          value={cents(s.contributionPerCredit)}
          accent={s.contributionPerCredit >= 0 ? "green" : "red"}
          sub="tax excluded; before refunds, storage, support, hosting, and other overhead"
        />
      </div>

      {/* Customers & usage */}
      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-muted">
        <T id="developer.customersUsageHeading" />
      </h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Customers"
          value={s.totalUsers.toLocaleString()}
          sub={`${s.payingUsers.toLocaleString()} have paid`}
        />
        <Stat
          label="Credits sold"
          value={s.creditsSold.toLocaleString()}
          sub={`${s.creditsSpent.toLocaleString()} used · ${s.bonusCredits.toLocaleString()} gifted`}
        />
        <Stat
          label="Credits outstanding"
          value={s.creditsOutstanding.toLocaleString()}
          sub="unspent — a liability"
        />
        <Stat
          label="Transcriptions"
          value={s.jobsCompleted.toLocaleString()}
          sub={`${hours(s.audioSeconds)}h of audio · ${s.jobsFailed} failed`}
        />
      </div>

      {/* Customer table */}
      <h2 className="mt-10 text-lg font-semibold">
        <T id="developer.customersHeading" />
      </h2>
      {s.customers.length === 0 ? (
        <p className="mt-2 text-sm text-muted">
          <T id="developer.noCustomers" />
        </p>
      ) : (
        <div
          role="region"
          aria-label="Customer summary"
          tabIndex={0}
          className="mt-4 overflow-x-auto"
        >
          <table className="w-full min-w-[44rem] text-left text-sm">
            <caption className="sr-only">
              Recent customers, payments, purchased credits, and current balances
            </caption>
            <thead className="border-b border-line text-muted">
              <tr>
                <th scope="col" className="py-2 pr-4 font-medium">Email</th>
                <th scope="col" className="py-2 pr-4 font-medium">Joined</th>
                <th scope="col" className="py-2 pr-4 font-medium text-right">Recorded pre-tax payments</th>
                <th scope="col" className="py-2 pr-4 font-medium text-right">Credits bought</th>
                <th scope="col" className="py-2 pr-4 font-medium text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {s.customers.map((c) => (
                <tr key={c.email} className="border-b border-line">
                  <td className="max-w-64 truncate py-2.5 pr-4">{c.email}</td>
                  <td className="py-2.5 pr-4 text-muted">
                    {c.createdAt.toISOString().slice(0, 10)}
                  </td>
                  <td className="py-2.5 pr-4 text-right font-medium">{usd(c.spentCents)}</td>
                  <td className="py-2.5 pr-4 text-right">{c.creditsBought.toLocaleString()}</td>
                  <td className="py-2.5 pr-4 text-right text-muted">
                    {c.creditBalance.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
