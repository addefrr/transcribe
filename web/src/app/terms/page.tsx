import type { Metadata } from "next";
import Link from "next/link";
import {
  emailHref,
  getSiteIdentity,
  POLICY_LAST_UPDATED,
  POLICY_LAST_UPDATED_ISO,
} from "@/lib/site-identity";

const description = "Plain-language terms for accounts, transcription, credits, and plans.";

export const metadata: Metadata = {
  title: "Terms",
  description,
  alternates: { canonical: "/terms" },
  openGraph: { title: "Transcribe terms of service", description, url: "/terms" },
};

const sectionClass = "space-y-3 border-t border-line pt-8";

export default function TermsPage() {
  const identity = getSiteIdentity();
  const contactEmail = identity.supportEmail ?? identity.privacyContactEmail;

  return (
    <article className="mx-auto max-w-3xl py-12 sm:py-16">
      <header>
        <p className="text-sm font-medium text-brand">Agreement</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Terms of service</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-muted">
          These terms describe the practical rules for using Transcribe. Pricing and checkout must
          show the specific amount, allowance, renewal, and tax information that applies to a
          purchase before you commit.
        </p>
        <p className="mt-3 text-sm text-muted">
          Last updated: <time dateTime={POLICY_LAST_UPDATED_ISO}>{POLICY_LAST_UPDATED}</time>
        </p>
      </header>

      {!identity.legalEntityName && (
        <aside
          className="status-warning mt-8"
          aria-label="Missing operator information"
        >
          The legal contracting party has not been configured for this deployment. The deployment
          owner must set <code>LEGAL_ENTITY_NAME</code> and obtain appropriate legal review before
          offering the service publicly or accepting payment.
        </aside>
      )}

      <div className="mt-10 space-y-10 text-[15px] leading-7">
        <section className={sectionClass} aria-labelledby="terms-agreement">
          <h2 id="terms-agreement" className="text-xl font-semibold">
            1. Your agreement with the operator
          </h2>
          <p>
            These terms are between you and{" "}
            <strong>{identity.legalEntityName ?? "the operator of this deployment"}</strong>. By
            creating an account, submitting media, or buying credits or a plan after being shown
            these terms, you agree to follow them. If you use Transcribe for an organisation, you
            confirm that you are allowed to act for it.
          </p>
          <p>
            If you do not agree, do not submit media or make a purchase. Mandatory consumer rights
            and other rights that cannot lawfully be waived still apply.
          </p>
        </section>

        <section className={sectionClass} aria-labelledby="terms-service">
          <h2 id="terms-service" className="text-xl font-semibold">
            2. What the service does
          </h2>
          <p>
            Transcribe accepts supported audio, video, recordings, and URLs and uses automatic
            speech-recognition services to create text, timestamps, and, when selected and
            available, speaker labels. Features can include playback, downloads, folders, public
            links, and browser-extension access.
          </p>
          <p>
            The plan or job screen identifies the features and limits available at that time.
            Provider availability, supported formats, maximum length, and rate limits can constrain
            a job. There is no promise that the service will be uninterrupted or finish within a
            particular time unless a separate written agreement says so.
          </p>
        </section>

        <section className={sectionClass} aria-labelledby="terms-account">
          <h2 id="terms-account" className="text-xl font-semibold">
            3. Your account
          </h2>
          <ul className="list-disc space-y-2 pl-6 marker:text-muted">
            <li>Provide an email address you control and keep account details current.</li>
            <li>Keep your password, session, and API tokens private.</li>
            <li>
              Revoke a token immediately if it is exposed. Activity performed with an active token
              is treated as activity from your account unless the operator caused the exposure.
            </li>
            <li>
              Email verification is required to receive any advertised new-account credit bonus.
            </li>
          </ul>
        </section>

        <section className={sectionClass} aria-labelledby="terms-content">
          <h2 id="terms-content" className="text-xl font-semibold">
            4. Media, transcripts, and permissions
          </h2>
          <p>
            You keep the rights you already have in media and transcript content. You give the
            operator and its processing providers a limited permission to receive, convert,
            transmit, store, and otherwise process that content only as needed to operate the
            requested features, secure the service, and meet legal obligations.
          </p>
          <p>
            You must have a lawful right or permission to upload, record, download, transcribe, and
            share the content. This includes copyright, confidentiality, privacy, consent, and
            recording-law obligations. A publicly reachable URL does not by itself prove that you
            may copy or transcribe its content.
          </p>
          <p>
            As between you and the operator, you may use the generated transcript, subject to the
            rights in the source material and applicable law. Automatic output may resemble or
            contain third-party material, so no promise is made that every use is free of third-party
            rights.
          </p>
        </section>

        <section className={sectionClass} aria-labelledby="terms-ai">
          <h2 id="terms-ai" className="text-xl font-semibold">
            5. Automatic output requires review
          </h2>
          <p>
            Transcripts, language detection, timestamps, and speaker labels are machine generated.
            They can omit words, invent words, confuse speakers, or misstate names, numbers, and
            technical terms. A higher-priced option or a speaker-label feature is not a guarantee
            of accuracy.
          </p>
          <p>
            Review important output against the source before publishing it or using it for legal,
            medical, safety, employment, financial, accessibility, or other consequential work.
            Transcribe is an editing aid, not a certified record or substitute for a qualified
            human review.
          </p>
        </section>

        <section className={sectionClass} aria-labelledby="terms-credits">
          <h2 id="terms-credits" className="text-xl font-semibold">
            6. Credits and job billing
          </h2>
          <ul className="list-disc space-y-2 pl-6 marker:text-muted">
            <li>
              Credit purchases are one-time purchases in US dollars. The purchase screen must show
              the number of credits, price, and any applicable tax before payment.
            </li>
            <li>
              A job&apos;s credit rate is shown before submission where its duration is known. Billing
              rounds media duration up to whole minutes and applies the selected tier&apos;s displayed
              credits-per-minute rate.
            </li>
            <li>
              The service can reserve an estimated number of credits while a job runs. It charges
              the settled duration, returns unused reserved credits, and returns the hold if the job
              fails before a transcript is completed.
            </li>
            <li>
              Purchased credits do not currently expire automatically. They remain attached to the
              account until used, refunded, reversed, or the account is closed. Promotional credits
              have no cash value and are not refundable.
            </li>
            <li>
              Cached processing may return an earlier transcript from your own account for the
              same supported source and job settings. It never reuses another customer&apos;s
              transcript. The price presented to you still applies to delivery of that result.
            </li>
          </ul>
        </section>

        <section className={sectionClass} aria-labelledby="terms-plans">
          <h2 id="terms-plans" className="text-xl font-semibold">
            7. Plans and allowances
          </h2>
          <ul className="list-disc space-y-2 pl-6 marker:text-muted">
            <li>
              Monthly and annual plans are recurring subscriptions. A week pass is a one-time
              purchase that expires after seven days and does not renew automatically.
            </li>
            <li>
              An annual plan is charged upfront for the year. It provides the same monthly audio
              allowance as the matching monthly plan, with that allowance resetting each month.
            </li>
            <li>
              Monthly allowance does not roll over. The plan page must show the actual limit and
              reset cadence before checkout; it is not unlimited.
            </li>
            <li>
              A Premium plan covers jobs using either Premium or Standard. A Standard plan covers
              Standard jobs only.
            </li>
            <li>
              Purchased credits are separate from the plan. A job not covered by an active plan or
              remaining allowance can use available backup credits at the displayed job rate.
            </li>
            <li>
              The service can reserve plan minutes and any required backup credits before provider
              processing. It settles the completed rounded duration and returns unused or failed-job
              reservations. This prevents simultaneous jobs from spending the same allowance.
            </li>
            <li>
              Recurring plans continue until cancelled. The checkout and account area should show
              the renewal amount and date. See the{" "}
              <Link href="/billing" className="text-brand underline underline-offset-4">
                Billing guide
              </Link>{" "}
              for the current process.
            </li>
          </ul>
        </section>

        <section className={sectionClass} aria-labelledby="terms-cancel">
          <h2 id="terms-cancel" className="text-xl font-semibold">
            8. Cancellation and refunds
          </h2>
          <p>
            You can cancel a recurring plan through the account billing controls when available or
            by contacting support. Cancellation stops a future renewal; the confirmation should
            state the exact date on which access ends. A week pass ends automatically.
          </p>
          <p>
            Failed transcription holds are returned automatically. Refunds for completed credit
            purchases, used credits, subscription charges, or partially used periods are not
            automatic. Contact support with the account email, date, amount, and reason. The
            operator will apply the checkout terms and applicable consumer law; nothing here limits
            a refund or withdrawal right that the law requires.
          </p>
        </section>

        <section className={sectionClass} aria-labelledby="terms-use">
          <h2 id="terms-use" className="text-xl font-semibold">
            9. Acceptable use
          </h2>
          <p>You must not use Transcribe to:</p>
          <ul className="list-disc space-y-2 pl-6 marker:text-muted">
            <li>break a law or violate another person&apos;s privacy or intellectual-property rights;</li>
            <li>record or monitor people without any consent or notice required by law;</li>
            <li>access media, accounts, systems, or networks without permission;</li>
            <li>upload malware or attempt to evade security, size, rate, or usage limits;</li>
            <li>resell access or automate abusive volumes without written permission; or</li>
            <li>
              represent an unchecked automatic transcript as a verified quotation when doing so
              could materially mislead or harm someone.
            </li>
          </ul>
          <p>
            The operator may limit or suspend abusive activity to protect users, providers, and the
            service. Where practical and lawful, the operator should explain the reason and offer a
            route to correct a mistake.
          </p>
        </section>

        <section className={sectionClass} aria-labelledby="terms-liability">
          <h2 id="terms-liability" className="text-xl font-semibold">
            10. Service problems and responsibility
          </h2>
          <p>
            Tell support promptly about an incorrect charge, lost access, security concern, or
            repeated processing failure. Reasonable recovery can include restoring access,
            returning an incorrect credit charge, correcting account data, or issuing a refund when
            required by the purchase terms or law.
          </p>
          <p>
            To the extent permitted by law, the operator is not responsible for loss caused by your
            lack of rights to source material, publication of an unchecked transcript, disclosure
            through a public link you enabled, or misuse of credentials you failed to protect.
            Nothing in these terms excludes liability or remedies that applicable law does not allow
            the parties to exclude.
          </p>
        </section>

        <section className={sectionClass} aria-labelledby="terms-changes">
          <h2 id="terms-changes" className="text-xl font-semibold">
            11. Changes and contact
          </h2>
          <p>
            The date at the top identifies this version. Material changes should be presented
            clearly before they govern a new purchase or renewal. The price, allowance, and term
            confirmed for an already-paid period remain the record of that purchase, subject to
            applicable law.
          </p>
          <p>
            Questions or notices can be sent to{" "}
            {contactEmail ? (
              <a
                href={emailHref(contactEmail, "Terms question")}
                className="font-medium text-brand underline underline-offset-4"
              >
                {contactEmail}
              </a>
            ) : (
              "the operator contact once it is configured"
            )}
            . See the{" "}
            <Link href="/privacy" className="text-brand underline underline-offset-4">
              Privacy notice
            </Link>{" "}
            for data requests.
          </p>
        </section>
      </div>
    </article>
  );
}
