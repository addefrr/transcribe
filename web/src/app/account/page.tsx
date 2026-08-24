import Link from "next/link";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { subscriptions } from "@/lib/schema";
import { getSettings } from "@/lib/settings";
import { getActiveSubscription, remainingMinutes } from "@/lib/subscriptions";
import { DeleteAccountForm, SubscriptionControls } from "./AccountControls";

export const metadata = { title: "Account", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

function duration(minutes: number): string {
  const hours = minutes / 60;
  return hours >= 1
    ? `${Number.isInteger(hours) ? hours : hours.toFixed(1)} hours`
    : `${minutes} minutes`;
}

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const [sub, settings, billingRows] = await Promise.all([
    getActiveSubscription(user.id),
    getSettings(),
    db
      .select({
        status: subscriptions.status,
        stripeCustomerId: subscriptions.stripeCustomerId,
      })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.userId, user.id),
          isNotNull(subscriptions.stripeCustomerId),
        ),
      )
      .orderBy(desc(subscriptions.createdAt))
      .limit(1),
  ]);
  const billing = billingRows[0];
  const billingNeedsAttention = Boolean(
    billing && ["past_due", "unpaid", "paused", "incomplete", "expired"].includes(billing.status),
  );
  const plan = sub ? settings.subscriptionPlans.find((candidate) => candidate.id === sub.planId) : null;

  return (
    <div className="page-stack max-w-3xl py-10">
      <header>
        <p className="eyebrow">Account controls</p>
        <h1 className="page-title">Your account</h1>
        <p className="page-intro">Review billing, export your data, or close the account.</p>
      </header>

      <section aria-labelledby="account-details" className="section-rule">
        <h2 id="account-details" className="section-title">Sign-in details</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-[9rem_1fr]">
          <dt className="text-muted">Email address</dt><dd className="break-all">{user.email}</dd>
          <dt className="text-muted">Verification</dt><dd>{user.emailVerified ? "Verified" : "Not verified"}</dd>
          <dt className="text-muted">Member since</dt><dd>{user.createdAt.toISOString().slice(0, 10)}</dd>
        </dl>
      </section>

      <section aria-labelledby="billing-control" className="section-rule">
        <h2 id="billing-control" className="section-title">Plan and renewal</h2>
        {sub ? (
          <>
            <p className="mt-3 font-medium">{plan?.label ?? sub.planId}</p>
            <p className="mt-1 text-sm text-muted">
              {duration(remainingMinutes(sub))} of {duration(sub.allowanceMinutes)} remain in this allowance period.
              {" "}Allowance resets {sub.allowancePeriodEnd.toISOString().slice(0, 10)}.
            </p>
            <p className="mt-1 text-sm text-muted">
              {sub.interval === "week"
                ? `One-time access ends ${sub.periodEnd.toISOString().slice(0, 10)}.`
                : sub.cancelAtPeriodEnd
                  ? `Renewal is canceled; access ends ${sub.periodEnd.toISOString().slice(0, 10)}.`
                  : `Renews ${sub.periodEnd.toISOString().slice(0, 10)} unless canceled.`}
            </p>
            {sub.interval !== "week" && (
              <SubscriptionControls cancelAtPeriodEnd={sub.cancelAtPeriodEnd} />
            )}
          </>
        ) : billingNeedsAttention ? (
          <p className="status-warning mt-3 text-sm" role="status">
            {billing?.status === "expired"
              ? "Plan access is paused because the paid period ended without a confirmed renewal. No subscription allowance is available until Stripe confirms an active period."
              : "Plan access is paused because Stripe reports that this subscription needs payment attention. No subscription allowance is available until Stripe marks it active again."}
          </p>
        ) : (
          <p className="mt-3 text-sm text-muted">
            No active plan. <Link className="text-link" href="/plans">Compare plans</Link>.
          </p>
        )}
        {billing?.stripeCustomerId && (
          <form action="/api/billing-portal" method="POST" className="mt-3">
            <button className="text-link inline-flex min-h-11 items-center" type="submit">
              View invoices and payment details
            </button>
          </form>
        )}
        <p className="mt-4 text-sm"><Link href="/billing" className="text-link">Read billing, tax, cancellation, and refund details</Link></p>
      </section>

      <section aria-labelledby="data-control" className="section-rule">
        <h2 id="data-control" className="section-title">Your data</h2>
        <p className="mt-3 text-sm text-muted">
          Download a machine-readable copy of your account, ledger, job metadata, and transcripts.
        </p>
        <a href="/api/account/export" className="button-secondary mt-4 inline-flex">Download my data (JSON)</a>
      </section>

      <section aria-labelledby="delete-account" className="section-rule border-danger/30">
        <h2 id="delete-account" className="section-title">Delete account</h2>
        <p className="mt-3 text-sm text-muted">
          This permanently removes transcripts, folders, public share links, API tokens, credit history,
          and retained media. Any queued work is canceled and its holds are returned; work already
          processing must finish first. Any Stripe subscription is stopped before deletion. This cannot
          be undone.
        </p>
        <DeleteAccountForm />
      </section>
    </div>
  );
}
