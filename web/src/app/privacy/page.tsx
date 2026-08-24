import type { Metadata } from "next";
import Link from "next/link";
import {
  emailHref,
  getSiteIdentity,
  POLICY_LAST_UPDATED,
  POLICY_LAST_UPDATED_ISO,
} from "@/lib/site-identity";

const description = "How Transcribe handles account, payment, audio, and transcript data.";

export const metadata: Metadata = {
  title: "Privacy",
  description,
  alternates: { canonical: "/privacy" },
  openGraph: { title: "Transcribe privacy notice", description, url: "/privacy" },
};

const sectionClass = "space-y-3 border-t border-line pt-8";

export default function PrivacyPage() {
  const identity = getSiteIdentity();
  const privacyEmail = identity.privacyContactEmail;

  return (
    <article className="mx-auto max-w-3xl py-12 sm:py-16">
      <header>
        <p className="text-sm font-medium text-brand">Policy</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Privacy notice</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-muted">
          This notice explains what the Transcribe service handles, why it is needed, where it
          goes, and what choices you have. It applies to the website, transcription worker, and
          browser-extension API.
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
          The legal operator name has not been configured for this deployment. The deployment
          owner must set <code>LEGAL_ENTITY_NAME</code> before offering the service publicly or
          accepting payment.
        </aside>
      )}

      <div className="mt-10 space-y-10 text-[15px] leading-7">
        <section className={sectionClass} aria-labelledby="privacy-who">
          <h2 id="privacy-who" className="text-xl font-semibold">
            Who is responsible
          </h2>
          {identity.legalEntityName ? (
            <p>
              <strong>{identity.legalEntityName}</strong> operates Transcribe and decides how the
              service uses account and customer data.
            </p>
          ) : (
            <p>The deployment operator is responsible, but its legal name is not yet published.</p>
          )}
          <p>
            Privacy questions and data requests can be sent to{" "}
            {privacyEmail ? (
              <a
                className="font-medium text-brand underline underline-offset-4"
                href={emailHref(privacyEmail, "Privacy request")}
              >
                {privacyEmail}
              </a>
            ) : (
              <strong>the privacy contact, which has not yet been configured</strong>
            )}
            . Do not send passwords, API tokens, card numbers, or unnecessary audio by email.
          </p>
        </section>

        <section className={sectionClass} aria-labelledby="privacy-data">
          <h2 id="privacy-data" className="text-xl font-semibold">
            Data the service handles
          </h2>
          <ul className="list-disc space-y-2 pl-6 marker:text-muted">
            <li>
              <strong>Account data:</strong> email address, email-verification state, a one-way
              password hash, sessions, password-reset records, and API-token records. Raw API
              tokens are shown once; the database stores a hash.
            </li>
            <li>
              <strong>Media and job data:</strong> files you upload, recording or source URL,
              filename or video title, selected language and tier, speaker-label choice, duration,
              job status, and technical error details.
            </li>
            <li>
              <strong>Results:</strong> transcript text, timestamps, detected language, automatic
              speaker labels, corrections, exports, folders, and any public-share identifier you
              create.
            </li>
            <li>
              <strong>Billing data:</strong> credit balance and ledger, plan and allowance usage,
              purchase amount, payment status, and Stripe transaction identifiers. Stripe, not
              Transcribe, receives full card details in hosted checkout.
            </li>
            <li>
              <strong>Operational data:</strong> request timing, IP-derived rate-limit state, and
              infrastructure logs needed to diagnose faults, prevent abuse, and operate the
              service.
            </li>
          </ul>
        </section>

        <section className={sectionClass} aria-labelledby="privacy-purpose">
          <h2 id="privacy-purpose" className="text-xl font-semibold">
            Why it is used
          </h2>
          <p>
            The service uses this data to create and secure your account, verify your email, reset
            passwords, receive media, produce and deliver transcripts, calculate charges and plan
            usage, process payments, send transactional email, provide support, prevent abuse, and
            meet legal accounting or payment obligations.
          </p>
          <p>
            Transcribe does not use transcript content to make credit, employment, insurance, or
            other eligibility decisions. Public sharing and browser notifications happen only
            after you choose them.
          </p>
        </section>

        <section className={sectionClass} aria-labelledby="privacy-reuse">
          <h2 id="privacy-reuse" className="text-xl font-semibold">
            Repeat-source transcript reuse
          </h2>
          <p>
            When transcript reuse is enabled, the service can return an earlier automatic
            transcript for the same recognised platform video, tier, language choice, and
            speaker-label setting instead of sending the audio to a provider again. Reuse is
            restricted to an earlier job owned by the same account; transcript content is never
            taken from another customer&apos;s job. Because the current stored transcript is reused,
            it can include corrections you previously made in that account.
          </p>
          <p>
            Reuse is intended only for identical platform media that the service is permitted to
            process. It is not appropriate for private or access-controlled media. Contact the
            privacy address if a source should not be eligible for reuse.
          </p>
        </section>

        <section className={sectionClass} aria-labelledby="privacy-providers">
          <h2 id="privacy-providers" className="text-xl font-semibold">
            Services that receive data
          </h2>
          <p>Only the information needed for the relevant function is sent to these services:</p>
          <dl className="space-y-4">
            <div>
              <dt className="font-semibold">Groq</dt>
              <dd className="text-muted">
                In the normal hosted configuration, Standard audio and the selected language hint
                are sent to Groq for speech-to-text processing. Read Groq&apos;s{" "}
                <a
                  href="https://console.groq.com/docs/legal"
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand underline underline-offset-4"
                >
                  policies and notices
                </a>
                .
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Soniox</dt>
              <dd className="text-muted">
                In the normal hosted configuration, Premium audio, language hints, and the
                speaker-label choice are sent to Soniox. The worker asks Soniox to delete its
                temporary file and transcription after retrieving the result. Provider-side logs
                and backup retention remain subject to the operator&apos;s Soniox agreement. Read
                Soniox&apos;s{" "}
                <a
                  href="https://soniox.com/docs/security-and-privacy"
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand underline underline-offset-4"
                >
                  security and privacy information
                </a>
                .
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Stripe</dt>
              <dd className="text-muted">
                Stripe hosts checkout and handles payment, billing, fraud-prevention, and tax data
                when payments are enabled. Read the{" "}
                <a
                  href="https://stripe.com/legal/privacy-center"
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand underline underline-offset-4"
                >
                  Stripe Privacy Center
                </a>
                .
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Resend</dt>
              <dd className="text-muted">
                Resend receives your email address and transactional message content to deliver
                verification and password-reset email when email delivery is configured. Read
                Resend&apos;s{" "}
                <a
                  href="https://resend.com/legal/privacy-policy"
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand underline underline-offset-4"
                >
                  privacy policy
                </a>
                .
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Hosting, database, and storage</dt>
              <dd className="text-muted">
                The deployment&apos;s hosting and PostgreSQL providers hold application and account
                data. Uploaded and retained audio is kept either on the deployment host or with its
                configured S3-compatible object-storage provider, such as Cloudflare R2. Ask the
                operator contact above for the providers and regions used by this deployment.
              </dd>
            </div>
          </dl>
          <p>
            These providers may process data in countries other than your own. Their contracts,
            selected regions, and applicable law determine the transfer safeguards and provider
            retention that apply.
          </p>
        </section>

        <section className={sectionClass} aria-labelledby="privacy-retention">
          <h2 id="privacy-retention" className="text-xl font-semibold">
            Retention and deletion
          </h2>
          <ul className="list-disc space-y-2 pl-6 marker:text-muted">
            <li>
              A source upload is scheduled for deletion after its job completes or fails. A broken
              or abandoned upload can remain until operational cleanup runs; contact the privacy
              address with the account email and job details if removal is needed.
            </li>
            <li>
              {identity.audioRetentionDays === 0 ? (
                <>This deployment is configured not to retain playable audio after processing.</>
              ) : (
                <>
                  A compressed playback copy is normally retained for up to{" "}
                  <strong>
                    {identity.audioRetentionDays} day
                    {identity.audioRetentionDays === 1 ? "" : "s"}
                  </strong>{" "}
                  after a completed job, then scheduled for deletion. Cleanup failures can delay
                  removal.
                </>
              )}
            </li>
            <li>
              Transcripts, job metadata, account data, folders, credit records, and plan records
              remain until you delete them or ask the operator to do so, except where payment,
              fraud-prevention, dispute, or other law requires a longer record.
            </li>
            <li>
              When a transcript or account is deleted, the service can retain additive lifetime
              totals such as payment value, provider cost, processed duration, and completed or
              failed job counts. These counters contain no account, job, source, transcript,
              payment, or provider identifier and cannot be used to reconstruct your content.
            </li>
            <li>
              A public transcript remains available to anyone with its unguessable link until you
              stop sharing it or the underlying transcript/account is deleted. Search indexing is
              discouraged, but possession of the link grants access.
            </li>
            <li>
              Stripe and the transcription and email providers apply their own retention rules to
              data they process.
            </li>
          </ul>
        </section>

        <section className={sectionClass} aria-labelledby="privacy-sharing">
          <h2 id="privacy-sharing" className="text-xl font-semibold">
            Your sharing choices
          </h2>
          <p>
            Transcripts are private to the signed-in account by default. Creating a public link
            makes the transcript and any enabled downloads accessible without signing in. Do not
            create a link unless every person whose information appears in the transcript can
            lawfully be included. Turning sharing off invalidates that link in the application,
            although copies already downloaded by other people cannot be recalled.
          </p>
        </section>

        <section className={sectionClass} aria-labelledby="privacy-cookies">
          <h2 id="privacy-cookies" className="text-xl font-semibold">
            Cookies and browser storage
          </h2>
          <p>
            The application uses an essential, HTTP-only session cookie to keep you signed in.
            Browser storage remembers choices such as light or dark theme and notification or sound
            preferences. The application does not currently include nonessential advertising or
            audience-analytics trackers, so it does not present a tracking-consent banner. Stripe
            may use its own fraud-prevention technology when you visit hosted checkout under
            Stripe&apos;s policy.
          </p>
        </section>

        <section className={sectionClass} aria-labelledby="privacy-ai">
          <h2 id="privacy-ai" className="text-xl font-semibold">
            Automatic transcription
          </h2>
          <p>
            Transcripts, detected languages, timestamps, and speaker labels are generated
            automatically. They can be wrong, especially with noise, overlapping speakers, names,
            numbers, accents, or specialist terms. Review important output before publishing it or
            relying on it. The service does not claim that automatic output is a verified record of
            what was said.
          </p>
        </section>

        <section className={sectionClass} aria-labelledby="privacy-rights">
          <h2 id="privacy-rights" className="text-xl font-semibold">
            Your requests and rights
          </h2>
          <p>
            Depending on the law where you live, you may be able to request access, correction,
            deletion, restriction, objection, or a portable copy of personal data, and may be able
            to complain to a data-protection authority. The operator may need to verify that the
            requesting person controls the account before acting.
          </p>
          <p>
            Start with the self-service controls for transcript sharing, API-token revocation, and
            account data where available. For anything else, email{" "}
            {privacyEmail ? (
              <a
                href={emailHref(privacyEmail, "Privacy request")}
                className="font-medium text-brand underline underline-offset-4"
              >
                {privacyEmail}
              </a>
            ) : (
              "the privacy contact once the deployment operator publishes it"
            )}
            . You can also review the{" "}
            <Link href="/terms" className="text-brand underline underline-offset-4">
              Terms
            </Link>{" "}
            or get practical help on the{" "}
            <Link href="/support" className="text-brand underline underline-offset-4">
              Support page
            </Link>
            .
          </p>
        </section>

        <section className={sectionClass} aria-labelledby="privacy-changes">
          <h2 id="privacy-changes" className="text-xl font-semibold">
            Changes to this notice
          </h2>
          <p>
            This page will be updated when the service&apos;s material data practices change. The date
            at the top identifies the published version. A material change should be explained
            before it affects existing account data where applicable law requires notice or choice.
          </p>
        </section>
      </div>
    </article>
  );
}
