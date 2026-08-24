import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import CustomAmount from "@/components/CustomAmount";
import { T } from "@/components/T";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { creditLedger } from "@/lib/schema";
import { getActiveSubscription, isSubscriptionBypassed } from "@/lib/subscriptions";

export const metadata = { title: "Credits", robots: { index: false, follow: false } };

const REASON_LABELS: Record<string, string> = {
  signup_bonus: "Welcome bonus",
  purchase: "Credits added",
  hold: "Used for a transcription",
  refund: "Unused credits returned",
};

export default async function CreditsPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; canceled?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const params = await searchParams;
  const settings = await getSettings();
  const { packs, usdCentsPerCredit, minPurchaseUsdCents } = settings;
  const rawSub = await getActiveSubscription(user.id);
  const sub = isSubscriptionBypassed(user, settings) ? null : rawSub;
  const taxEnabled = process.env.STRIPE_AUTOMATIC_TAX === "1";

  const ledger = await db
    .select()
    .from(creditLedger)
    .where(eq(creditLedger.userId, user.id))
    .orderBy(desc(creditLedger.createdAt))
    .limit(25);

  return (
    <div className="py-10">
      <h1 className="text-2xl font-semibold">
        {sub ? <T id="credits.subscribedHeading" /> : <T id="credits.heading" />}
      </h1>
      <p className="mt-1 text-muted">
        {sub ? (
          <T id="credits.subscribedBalance" vars={{ credits: user.creditBalance }} />
        ) : (
          <T id="credits.balance" vars={{ credits: user.creditBalance }} />
        )}
      </p>

      {!user.emailVerified && (
        <p role="status" className="status-info mt-5">
          Verify your email before purchasing. This prevents a typo from stranding a payment.
        </p>
      )}

      {params.success && (
        <p role="status" className="status-success mt-4">
          Checkout returned. Credits appear only after Stripe confirms payment; refresh if the balance has not updated yet.
        </p>
      )}
      {params.canceled && (
        <p role="status" className="status-info mt-4">
          <T id="credits.canceledNotice" />
        </p>
      )}

      {sub && <h2 className="mt-8 text-lg font-semibold"><T id="credits.subscribedTopUpHeading" /></h2>}
      <div className={`${sub ? "mt-4" : "mt-8"} grid gap-6 sm:grid-cols-3`}>
        {packs.map((pack) => (
          <form
            key={pack.id}
            action="/api/stripe/checkout"
            method="POST"
            className="rounded-xl border border-line p-6 text-center"
          >
            <input type="hidden" name="packId" value={pack.id} />
            <input type="hidden" name="checkoutAttempt" value={randomUUID()} />
            <h3 className="font-semibold">{pack.name}</h3>
            <p className="mt-1 text-3xl font-bold">{pack.credits}</p>
            <p className="text-sm text-muted"><T id="credits.creditsWord" /></p>
            <p className="mt-2 text-xs text-muted">
              {(pack.amountUsdCents / pack.credits).toFixed(3)}¢ per credit
            </p>
            <button
              type="submit"
              disabled={!user.emailVerified}
              className="button-primary mt-4 w-full"
            >
              <T id="credits.buyCta" vars={{ dollars: (pack.amountUsdCents / 100).toFixed(2) }} />
            </button>
          </form>
        ))}
      </div>

      <div className="mt-6 max-w-md">
        <CustomAmount
          usdCentsPerCredit={usdCentsPerCredit}
          minPurchaseUsdCents={minPurchaseUsdCents}
          disabled={!user.emailVerified}
          checkoutAttempt={randomUUID()}
        />
      </div>

      <div className="mt-6 max-w-2xl border-y border-line py-4 text-sm text-muted">
        <p>Prices are in USD. {taxEnabled ? "Applicable tax is calculated and shown before payment." : "Tax automation is not configured; use the total Stripe shows before paying."}</p>
        <p className="mt-1">Credits do not expire while your account exists. Failed jobs return reserved credits. A job that crosses a plan allowance uses backup credits only for the excess.</p>
        <p className="mt-2"><a href="/billing" className="text-link">Billing, cancellation, and refund details</a></p>
      </div>

      <h2 className="mt-12 text-lg font-semibold"><T id="credits.activityHeading" /></h2>
      {ledger.length === 0 ? (
        <p className="mt-2 text-sm text-muted"><T id="credits.activityEmpty" /></p>
      ) : (
        <div
          role="region"
          aria-label="Credit activity"
          tabIndex={0}
          className="mt-4 overflow-x-auto"
        >
          <table className="w-full min-w-[28rem] max-w-xl text-left text-sm">
            <caption className="sr-only">Your latest 25 credit transactions</caption>
            <thead className="sr-only">
              <tr>
                <th scope="col">Date and time</th>
                <th scope="col">Activity</th>
                <th scope="col">Credit change</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((row) => (
                <tr key={row.id} className="border-b border-line">
                  <td className="py-2 pr-4 text-muted">
                    {row.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                  </td>
                  <td className="py-2 pr-4">{REASON_LABELS[row.reason] ?? row.reason}</td>
                  <td className={`py-2 text-right font-mono ${row.delta >= 0 ? "text-success" : "text-muted"}`}>
                    {row.delta > 0 ? `+${row.delta}` : row.delta}
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
