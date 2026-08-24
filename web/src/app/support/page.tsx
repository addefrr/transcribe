import type { Metadata } from "next";
import Link from "next/link";
import { emailHref, getSiteIdentity } from "@/lib/site-identity";

const description = "Practical help for account, job, transcript, billing, and privacy problems.";

export const metadata: Metadata = {
  title: "Support",
  description,
  alternates: { canonical: "/support" },
  openGraph: { title: "Transcribe support", description, url: "/support" },
};

function SupportContact({ email }: { email: string | null }) {
  return email ? (
    <a
      href={emailHref(email, "Transcribe support request")}
      className="inline-flex min-h-11 items-center rounded-lg bg-ink px-5 py-2.5 text-sm font-medium text-paper transition hover:opacity-90"
    >
      Email {email}
    </a>
  ) : (
    <div className="status-warning">
      A support email has not been configured for this deployment. The operator must set{" "}
      <code>SUPPORT_EMAIL</code> before launch.
    </div>
  );
}

export default function SupportPage() {
  const identity = getSiteIdentity();

  return (
    <article className="mx-auto max-w-3xl py-12 sm:py-16">
      <header>
        <p className="text-sm font-medium text-brand">Help</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Support</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-muted">
          Start with the recovery steps below. If the problem remains, send the account email and
          relevant job or payment details so the issue can be investigated without asking for
          secrets you should never share.
        </p>
        <div className="mt-6">
          <SupportContact email={identity.supportEmail} />
        </div>
      </header>

      <div className="mt-12 space-y-10 text-[15px] leading-7">
        <section className="space-y-3 border-t border-line pt-8" aria-labelledby="support-account">
          <h2 id="support-account" className="text-xl font-semibold">
            Sign-in and email verification
          </h2>
          <ul className="list-disc space-y-2 pl-6 marker:text-muted">
            <li>
              If you forgot the password, use{" "}
              <Link href="/forgot-password" className="text-brand underline underline-offset-4">
                Reset your password
              </Link>
              . The response is deliberately the same whether an account exists, so check spam and
              confirm that you entered the correct address.
            </li>
            <li>
              If the verification link expired, sign in and use “Resend verification email” in the
              banner. Verification links expire after 24 hours and can be used only once.
            </li>
            <li>
              The introductory credit bonus is added only after the email address is verified. It
              is not added merely by creating the account.
            </li>
          </ul>
        </section>

        <section className="space-y-3 border-t border-line pt-8" aria-labelledby="support-job">
          <h2 id="support-job" className="text-xl font-semibold">
            A job is stuck or failed
          </h2>
          <ol className="list-decimal space-y-2 pl-6 marker:text-muted">
            <li>Open the job from your transcription dashboard and read its current status.</li>
            <li>
              If it is still running, leave it in the queue; submitting duplicates can spend the
              allowance or credits more than once.
            </li>
            <li>
              If it failed, any held credits are returned automatically and subscription minutes
              are not charged for an incomplete transcript. A failed upload may need to be uploaded
              again because source files are removed after a terminal job.
            </li>
            <li>
              If the same problem repeats, send support the job ID from its page URL, approximate
              time, selected tier, source type, and visible error. Do not email a private source URL
              or the media itself unless support confirms it is necessary and provides an
              appropriate method.
            </li>
          </ol>
          <p>
            A temporary provider or capacity error is usually safe to retry later. Re-check the
            displayed price or plan allowance before confirming a new job.
          </p>
        </section>

        <section className="space-y-3 border-t border-line pt-8" aria-labelledby="support-result">
          <h2 id="support-result" className="text-xl font-semibold">
            The transcript is inaccurate
          </h2>
          <p>
            Automatic speech recognition can mishear names, numbers, overlapping speech, accents,
            or noisy recordings. Check important passages against the audio. Use transcript editing
            controls when available, or download the text and correct it in your editor. Speaker
            labels are automatic estimates, not verified identities.
          </p>
          <p>
            A different tier can use a different provider and feature set, but it does not guarantee
            a correct result. If the output points to a repeatable system fault, include the job ID,
            expected language, and a short description in the support request. Avoid sending
            sensitive transcript excerpts unless needed.
          </p>
        </section>

        <section className="space-y-3 border-t border-line pt-8" aria-labelledby="support-billing">
          <h2 id="support-billing" className="text-xl font-semibold">
            Credits, payments, and plans
          </h2>
          <ul className="list-disc space-y-2 pl-6 marker:text-muted">
            <li>
              After returning from Stripe, allow a short time for the signed payment webhook to
              update the balance or plan. Refresh the page before attempting a second purchase.
            </li>
            <li>
              Review credit activity on the{" "}
              <Link href="/credits" className="text-brand underline underline-offset-4">
                Credits page
              </Link>{" "}
              and current allowance on the{" "}
              <Link href="/plans" className="text-brand underline underline-offset-4">
                Plans page
              </Link>
              .
            </li>
            <li>
              For an incorrect charge, cancellation, or refund request, include the account email,
              charge date, amount, currency, and Stripe receipt or checkout identifier if available.
              Never send a full card number or security code.
            </li>
          </ul>
          <p>
            The{" "}
            <Link href="/billing" className="text-brand underline underline-offset-4">
              Billing guide
            </Link>{" "}
            explains currencies, tax, renewal, allowance resets, cancellation, and failed-job
            credits.
          </p>
        </section>

        <section className="space-y-3 border-t border-line pt-8" aria-labelledby="support-security">
          <h2 id="support-security" className="text-xl font-semibold">
            Tokens and account security
          </h2>
          <p>
            If an API token is exposed, revoke it from{" "}
            <Link href="/tokens" className="text-brand underline underline-offset-4">
              Browser extension &amp; API access
            </Link>{" "}
            and create a replacement. If the password may be exposed, reset it; a password reset
            revokes existing signed-in sessions. Do not paste a password, session cookie, API token,
            or email verification/reset link into a support message.
          </p>
        </section>

        <section className="space-y-3 border-t border-line pt-8" aria-labelledby="support-sharing">
          <h2 id="support-sharing" className="text-xl font-semibold">
            Public links and data requests
          </h2>
          <p>
            If a transcript should no longer be public, open the job and select “Stop sharing.” The
            old link then stops working in Transcribe, although previously downloaded copies cannot
            be recalled.
          </p>
          <p>
            For access, correction, export, or deletion requests, read the{" "}
            <Link href="/privacy" className="text-brand underline underline-offset-4">
              Privacy notice
            </Link>{" "}
            and contact{" "}
            {identity.privacyContactEmail ? (
              <a
                href={emailHref(identity.privacyContactEmail, "Privacy request")}
                className="font-medium text-brand underline underline-offset-4"
              >
                {identity.privacyContactEmail}
              </a>
            ) : (
              "the privacy contact once the operator configures it"
            )}
            . The operator may ask for account verification, but should not ask for the password.
          </p>
        </section>

        <section className="space-y-3 border-t border-line pt-8" aria-labelledby="support-message">
          <h2 id="support-message" className="text-xl font-semibold">
            What to include in a support message
          </h2>
          <ul className="list-disc space-y-2 pl-6 marker:text-muted">
            <li>the email address used for the account;</li>
            <li>the job ID, payment date, or other non-secret reference;</li>
            <li>what you expected, what happened, and any visible error;</li>
            <li>browser and device type when the problem is visual or interactive; and</li>
            <li>whether the problem can be repeated.</li>
          </ul>
          <p>
            No guaranteed response time is published. Do not delay contacting a payment provider,
            regulator, emergency service, or other appropriate authority where a deadline or urgent
            safety issue applies.
          </p>
        </section>
      </div>
    </article>
  );
}
