import type { Metadata } from "next";
import Link from "next/link";
import { emailHref, getSiteIdentity } from "@/lib/site-identity";

const description = "How Transcribe credits, plans, tax, renewals, cancellations, and refunds work.";

export const metadata: Metadata = {
  title: "Billing guide",
  description,
  alternates: { canonical: "/billing" },
  openGraph: { title: "Transcribe billing guide", description, url: "/billing" },
};

export default function BillingPage() {
  const identity = getSiteIdentity();

  return (
    <article className="mx-auto max-w-3xl py-12 sm:py-16">
      <header>
        <p className="text-sm font-medium text-brand">Before you buy</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Billing guide</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-muted">
          This page explains the difference between credits and plans, when charges repeat, and
          what happens when a job fails. The exact checkout total and plan limit shown for your
          purchase take priority over general examples.
        </p>
      </header>

      <div className="mt-10 space-y-10 text-[15px] leading-7">
        <section className="space-y-3 border-t border-line pt-8" aria-labelledby="billing-currency">
          <h2 id="billing-currency" className="text-xl font-semibold">
            Currency and tax
          </h2>
          <p>
            Prices and charges are in <strong>US dollars (USD)</strong>. A bank, card issuer, or
            payment method may apply its own currency-conversion or international-transaction fee;
            those fees are not Transcribe charges.
          </p>
          {identity.automaticTaxEnabled ? (
            <div className="rounded-lg border border-line bg-paper-2 p-4">
              <p className="font-semibold">Automatic tax is configured</p>
              <p className="mt-1 text-muted">
                This deployment is configured to ask Stripe Checkout to calculate applicable VAT,
                sales tax, or similar tax from the billing information supplied there. Stripe must
                show the final tax and total before the payment button is confirmed. Do not complete
                checkout if that total is missing or differs from what you expect.
              </p>
            </div>
          ) : (
            <div className="status-warning">
              <p className="font-semibold">Automatic tax is not enabled</p>
              <p className="mt-1">
                Displayed prices should be treated as before tax unless a purchase screen explicitly
                says tax is included. The deployment operator must configure its tax obligations
                before accepting purchases in places where VAT, sales tax, or similar tax must be
                collected. Do not assume a displayed price includes tax.
              </p>
            </div>
          )}
          <p>
            Stripe hosts the payment form. Transcribe receives payment status, amount, and reference
            data, but not the full card number. Always review the amount, tax, currency, product, and
            recurring terms displayed by Stripe before paying.
          </p>
        </section>

        <section className="space-y-3 border-t border-line pt-8" aria-labelledby="billing-credits">
          <h2 id="billing-credits" className="text-xl font-semibold">
            One-time credit purchases
          </h2>
          <ul className="list-disc space-y-2 pl-6 marker:text-muted">
            <li>A credit pack or custom credit amount is charged once and does not renew.</li>
            <li>
              The purchase screen must show the exact credit quantity and USD price. Compare packs
              by their effective price per credit, not by the pack name.
            </li>
            <li>
              Job charges use the selected tier&apos;s displayed credit rate and round duration up to
              whole minutes. Premium and Standard can have different rates.
            </li>
            <li>
              Purchased credits do not currently expire automatically. Promotional credits have no
              cash value.
            </li>
            <li>
              If you have a plan, purchased credits remain as backup. A job outside the plan&apos;s tier
              coverage or remaining allowance can use that balance at the displayed credit rate.
            </li>
          </ul>
          <Link href="/credits" className="font-medium text-brand underline underline-offset-4">
            View credits and purchase history
          </Link>
        </section>

        <section className="space-y-3 border-t border-line pt-8" aria-labelledby="billing-plans">
          <h2 id="billing-plans" className="text-xl font-semibold">
            Plans, renewal, and allowance resets
          </h2>
          <div
            role="region"
            aria-label="Plan billing intervals"
            tabIndex={0}
            className="overflow-x-auto rounded-lg border border-line"
          >
            <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
              <caption className="sr-only">How each plan interval is billed and reset</caption>
              <thead className="bg-paper-2 text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Interval</th>
                  <th scope="col" className="px-4 py-3 font-medium">Charge</th>
                  <th scope="col" className="px-4 py-3 font-medium">Allowance</th>
                  <th scope="col" className="px-4 py-3 font-medium">Renewal</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-line">
                  <th scope="row" className="px-4 py-3 font-medium">Monthly</th>
                  <td className="px-4 py-3 text-muted">Charged monthly</td>
                  <td className="px-4 py-3 text-muted">Resets monthly</td>
                  <td className="px-4 py-3 text-muted">Automatic until cancelled</td>
                </tr>
                <tr className="border-t border-line">
                  <th scope="row" className="px-4 py-3 font-medium">Annual</th>
                  <td className="px-4 py-3 text-muted">Full year charged upfront</td>
                  <td className="px-4 py-3 text-muted">Same limit as monthly; resets each month</td>
                  <td className="px-4 py-3 text-muted">Automatic yearly until cancelled</td>
                </tr>
                <tr className="border-t border-line">
                  <th scope="row" className="px-4 py-3 font-medium">Week pass</th>
                  <td className="px-4 py-3 text-muted">One-time charge</td>
                  <td className="px-4 py-3 text-muted">Available for seven days</td>
                  <td className="px-4 py-3 text-muted">Does not renew</td>
                </tr>
              </tbody>
            </table>
          </div>
          <ul className="list-disc space-y-2 pl-6 marker:text-muted">
            <li>
              Unused plan minutes do not roll over. An annual payment does not create one large
              annual audio pool.
            </li>
            <li>
              A Premium plan covers Premium and Standard jobs. A Standard plan covers Standard
              jobs only.
            </li>
            <li>
              Plans are limited by the audio allowance shown before purchase; they are not
              unlimited. The account area should show the remaining allowance and next reset.
            </li>
            <li>
              The price, recurring interval, allowance, reset cadence, and first renewal date must
              be visible before confirming checkout.
            </li>
          </ul>
          <Link href="/plans" className="font-medium text-brand underline-offset-4 hover:underline">
            Compare current plan terms
          </Link>
        </section>

        <section className="space-y-3 border-t border-line pt-8" aria-labelledby="billing-jobs">
          <h2 id="billing-jobs" className="text-xl font-semibold">
            Job holds, final charges, and failures
          </h2>
          <p>
            For credit billing, the service can hold an estimated amount once it knows the media
            duration. When processing completes, it charges the rounded final duration and returns
            any unused hold. If processing fails before a transcript is completed, held credits are
            returned automatically.
          </p>
          <p>
            Subscription minutes can also be reserved before provider processing so simultaneous
            jobs cannot all spend the same remaining allowance. Completion settles the rounded
            transcript duration; unused reserved minutes are returned, and a failed job returns its
            reservation. If a failed job appears to have reduced the plan allowance, or a credit
            hold is not returned, contact support with the job ID rather than submitting repeated
            duplicates.
          </p>
        </section>

        <section className="space-y-3 border-t border-line pt-8" aria-labelledby="billing-cancel">
          <h2 id="billing-cancel" className="text-xl font-semibold">
            Cancelling a recurring plan
          </h2>
          <ol className="list-decimal space-y-2 pl-6 marker:text-muted">
            <li>Open the signed-in account or billing controls and choose the plan-management option.</li>
            <li>
              If self-service management is unavailable, email support from the account address and
              ask to cancel before the renewal date.
            </li>
            <li>
              Keep the confirmation. It should state that automatic renewal is off and give the
              exact date on which plan access ends.
            </li>
          </ol>
          <p>
            Cancellation normally stops the next recurring charge and leaves already-paid access
            available until the confirmed period end. Deleting cookies, logging out, or simply not
            using the service does not cancel a Stripe subscription. Week passes expire without a
            cancellation request.
          </p>
        </section>

        <section className="space-y-3 border-t border-line pt-8" aria-labelledby="billing-refunds">
          <h2 id="billing-refunds" className="text-xl font-semibold">
            Refunds and payment corrections
          </h2>
          <p>
            A failed transcription returns its held credits automatically; that is a job-billing
            correction, not a refund of the original pack purchase. Credit-pack, subscription, and
            partially used period refunds are not automatic.
          </p>
          <p>
            To question a charge or request a refund, contact support with the account email, charge
            date, USD amount, reason, and Stripe receipt or checkout reference if available. Do not
            send card details. The operator will apply the purchase terms and applicable consumer
            law, including any mandatory refund or withdrawal right.
          </p>
        </section>

        <section className="space-y-3 border-t border-line pt-8" aria-labelledby="billing-contact">
          <h2 id="billing-contact" className="text-xl font-semibold">
            Billing contact
          </h2>
          {identity.supportEmail ? (
            <p>
              Email{" "}
              <a
                href={emailHref(identity.supportEmail, "Billing question")}
                className="font-medium text-brand underline-offset-4 hover:underline"
              >
                {identity.supportEmail}
              </a>{" "}
              for billing help. You can also review the{" "}
              <Link href="/terms" className="text-brand underline-offset-4 hover:underline">
                Terms of service
              </Link>
              .
            </p>
          ) : (
            <div className="status-warning">
              A billing-support address has not been configured. The operator must set{" "}
              <code>SUPPORT_EMAIL</code> before accepting payments.
            </div>
          )}
        </section>
      </div>
    </article>
  );
}
