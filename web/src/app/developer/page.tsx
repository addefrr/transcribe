import Link from "next/link";
import { redirect } from "next/navigation";
import { T } from "@/components/T";
import { getCurrentUser } from "@/lib/auth";
import { getAdminStats, isAdmin } from "@/lib/admin";
import { getWallet } from "@/lib/wallet";

export const metadata = { title: "Developer portal — Transcribe" };
export const dynamic = "force-dynamic";

const usd = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
// Per-credit values are sub-cent; show as cents with 3 decimals (e.g. "4.800¢").
const cents = (c: number) => `${c.toFixed(3)}¢`;
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
      ? "text-green-600 dark:text-green-400"
      : accent === "red"
        ? "text-red-600 dark:text-red-400"
        : "text-ink";
  return (
    <div className="rounded-xl border border-line p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </div>
  );
}

export default async function DeveloperPage() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) redirect("/dashboard");
  const s = await getAdminStats();
  const wallet = await getWallet();

  return (
    <div className="py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          <T id="developer.portalTitle" />
        </h1>
        <Link
          href="/developer/settings"
          className="rounded-md border border-line px-4 py-1.5 text-sm font-medium hover:border-brand"
        >
          <T id="developer.settings" />
        </Link>
      </div>
      <p className="mt-1 text-sm text-muted">
        Business overview. Profit figures are estimates based on your configured cost
        assumptions (Stripe {s.assumptions.stripeFeePct}% + {s.assumptions.stripeFeeFixedCents}¢
        per sale, {s.assumptions.costPerCreditCents}¢ compute per credit).
      </p>

      {/* Money */}
      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-muted">
        <T id="developer.revenueHeading" />
      </h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Revenue" value={usd(s.revenueCents)} sub={`${s.purchaseCount} purchases`} />
        <Stat
          label="Estimated profit"
          value={usd(s.profitCents)}
          sub={`${s.marginPct.toFixed(1)}% margin`}
          accent={s.profitCents >= 0 ? "green" : "red"}
        />
        <Stat
          label="Stripe fees (est.)"
          value={usd(s.stripeFeesCents)}
          accent="red"
        />
        <Stat label="Compute cost (est.)" value={usd(s.computeCostCents)} accent="red" />
      </div>

      {/* Spend wallet */}
      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-muted">
        <T id="developer.walletHeading" />
      </h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Revenue in wallet" value={usd(wallet.revenueCents)} />
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
          label="Profit / credit"
          value={cents(s.profitPerCredit)}
          accent={s.profitPerCredit >= 0 ? "green" : "red"}
          sub="what you make per credit sold"
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
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr>
                <th className="py-2 pr-4 font-medium">Email</th>
                <th className="py-2 pr-4 font-medium">Joined</th>
                <th className="py-2 pr-4 font-medium text-right">Total spent</th>
                <th className="py-2 pr-4 font-medium text-right">Credits bought</th>
                <th className="py-2 pr-4 font-medium text-right">Balance</th>
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
