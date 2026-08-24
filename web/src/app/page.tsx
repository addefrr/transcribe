import Link from "next/link";
import type { Metadata } from "next";
import { T } from "@/components/T";
import {
  TIER_FEATURE_KEYS,
  TIER_FEATURE_LABELS,
  type TierKey,
} from "@/lib/pricing";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

function pricePerCredit(amountUsdCents: number, credits: number): string {
  const cents = amountUsdCents / credits;
  return `${cents < 1 ? cents.toFixed(3) : cents.toFixed(2)}¢`;
}

export default async function Home() {
  const { tiers, tierFeatures, packs, signupBonusCredits } = await getSettings();
  const tierEntries = Object.entries(tiers) as [TierKey, (typeof tiers)[TierKey]][];
  const speakerLabelsAvailable = tierEntries.some(
    ([tier]) => tierFeatures[tier].speakerLabels,
  );
  const steps: Array<{
    number: string;
    title: string;
    body: string;
    vars?: Record<string, string | number>;
  }> = [
    {
      number: "01",
      title: "landing.step1Title",
      body: signupBonusCredits > 0 ? "landing.step1Body" : "landing.step1BodyNoBonus",
      vars: signupBonusCredits > 0 ? { credits: signupBonusCredits } : undefined,
    },
    { number: "02", title: "landing.step2Title", body: "landing.step2Body" },
    { number: "03", title: "landing.step3Title", body: "landing.step3Body" },
  ];
  const sampleLines = [
    {
      timestamp: "00:06",
      dateTime: "PT6S",
      speaker: "landing.exampleSpeakerOne",
      text: "landing.exampleLineOne",
    },
    {
      timestamp: "00:16",
      dateTime: "PT16S",
      speaker: "landing.exampleSpeakerTwo",
      text: "landing.exampleLineTwo",
    },
    {
      timestamp: "00:29",
      dateTime: "PT29S",
      speaker: "landing.exampleSpeakerOne",
      text: "landing.exampleLineThree",
    },
  ];

  return (
    <div>
      <section className="grid gap-12 py-14 sm:py-20 lg:grid-cols-[minmax(0,0.9fr)_minmax(28rem,1.1fr)] lg:items-center lg:gap-16">
        <div>
          <p className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted">
            <span aria-hidden="true" className="h-px w-8 bg-brand" />
            <T id="landing.badge" />
          </p>
          <h1 className="mt-6 max-w-2xl text-pretty text-4xl font-semibold leading-[1.08] tracking-[-0.035em] sm:text-6xl">
            <T id="landing.heroTitle" />
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-muted sm:text-lg">
            <T id="landing.heroSubtitle" />
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/signup"
              className="inline-flex min-h-12 items-center justify-center rounded-lg bg-ink px-5 text-sm font-semibold text-paper transition hover:opacity-90"
            >
              {signupBonusCredits > 0 ? (
                <T id="landing.ctaPrimary" vars={{ credits: signupBonusCredits }} />
              ) : (
                <T id="landing.ctaPrimaryNoBonus" />
              )}
            </Link>
            <Link
              href="#pricing"
              className="inline-flex min-h-12 items-center justify-center rounded-lg border border-line px-5 text-sm font-semibold transition hover:border-ink hover:bg-paper-2"
            >
              <T id="landing.ctaSecondary" />
            </Link>
          </div>
        </div>

        <figure className="overflow-hidden rounded-2xl border border-line bg-paper shadow-[0_20px_60px_-40px_rgba(10,10,11,0.35)]">
          <figcaption className="flex flex-wrap items-start justify-between gap-3 border-b border-line bg-paper-2 px-5 py-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                <T id="landing.exampleEyebrow" />
              </p>
              <h2 className="mt-1 text-base font-semibold">
                <T id="landing.exampleTitle" />
              </h2>
            </div>
            <p className="font-mono text-xs text-muted">
              <T id="landing.exampleMeta" />
            </p>
          </figcaption>

          <div className="flex h-14 items-center gap-1 border-b border-line px-5" aria-hidden="true">
            {[9, 16, 24, 13, 29, 19, 10, 22, 31, 18, 25, 12, 20, 27, 14, 8, 17, 11].map(
              (height, index) => (
                <span
                  key={`${height}-${index}`}
                  className="w-1 rounded-full bg-brand/55"
                  style={{ height }}
                />
              ),
            )}
            <span className="ml-3 h-px flex-1 bg-line" />
            <span className="ml-2 font-mono text-xs text-muted">00:42</span>
          </div>

          <ol className="divide-y divide-line px-5">
            {sampleLines.map((line) => (
              <li
                key={line.timestamp}
                className="grid grid-cols-[3rem_minmax(0,1fr)] gap-3 py-5"
              >
                <time dateTime={line.dateTime} className="font-mono text-xs text-muted">
                  {line.timestamp}
                </time>
                <div>
                  {speakerLabelsAvailable && (
                    <p className="mb-1 text-xs font-semibold text-brand">
                      <T id={line.speaker} />
                    </p>
                  )}
                  <p className="text-[0.95rem] leading-6">
                    <T id={line.text} />
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <p className="border-t border-line bg-warning-soft px-5 py-3 text-sm leading-6 text-warning">
            <T id="landing.exampleNotice" />
          </p>
        </figure>
      </section>

      <section
        aria-labelledby="workflow-heading"
        className="grid gap-10 border-t border-line py-16 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)] lg:gap-16"
      >
        <div>
          <h2 id="workflow-heading" className="max-w-md text-3xl font-semibold tracking-tight">
            <T id="landing.workflowHeading" />
          </h2>
          <p className="mt-4 max-w-md leading-7 text-muted">
            <T id="landing.workflowIntro" />
          </p>
        </div>
        <ol className="border-t border-line">
          {steps.map((step) => (
            <li
              key={step.number}
              className="grid gap-2 border-b border-line py-6 sm:grid-cols-[3rem_11rem_minmax(0,1fr)] sm:gap-4"
            >
              <span className="font-mono text-sm text-brand">{step.number}</span>
              <h3 className="font-semibold">
                <T id={step.title} />
              </h3>
              <p className="max-w-xl text-sm leading-6 text-muted">
                <T id={step.body} vars={step.vars} />
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="comparison-heading" className="border-t border-line py-16">
        <div className="max-w-2xl">
          <h2 id="comparison-heading" className="text-3xl font-semibold tracking-tight">
            <T id="landing.qualityHeading" />
          </h2>
          <p className="mt-3 leading-7 text-muted">
            <T id="landing.qualitySubheading" />
          </p>
        </div>

        <div
          role="region"
          aria-label="Transcription tier feature comparison"
          tabIndex={0}
          className="mt-8 overflow-x-auto rounded-xl border border-line"
        >
          <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
            <caption className="sr-only">
              <T id="landing.comparisonCaption" />
            </caption>
            <thead className="bg-paper-2">
              <tr>
                <th scope="col" className="px-5 py-4 font-medium text-muted">
                  <span className="sr-only">Feature</span>
                </th>
                {tierEntries.map(([id, tier]) => (
                  <th key={id} scope="col" className="px-5 py-4 text-base font-semibold">
                    {tier.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-line">
                <th scope="row" className="px-5 py-4 font-medium">
                  <T id="landing.rateLabel" />
                </th>
                {tierEntries.map(([id, tier]) => (
                  <td key={id} className="px-5 py-4">
                    {tier.creditsPerMinute} {tier.creditsPerMinute === 1 ? "credit" : "credits"}
                  </td>
                ))}
              </tr>
              {TIER_FEATURE_KEYS.map((feature) => (
                <tr key={feature} className="border-t border-line">
                  <th scope="row" className="px-5 py-4 font-medium">
                    {TIER_FEATURE_LABELS[feature]}
                  </th>
                  {tierEntries.map(([id]) => (
                    <td
                      key={id}
                      className={`px-5 py-4 ${
                        tierFeatures[id][feature] ? "font-medium text-ink" : "text-muted"
                      }`}
                    >
                      {tierFeatures[id][feature] ? (
                        <T id="landing.includedLabel" />
                      ) : (
                        <T id="landing.notIncludedLabel" />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section
        aria-labelledby="review-heading"
        className="grid gap-8 border-t border-line py-16 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16"
      >
        <div>
          <h2 id="review-heading" className="max-w-md text-3xl font-semibold tracking-tight">
            <T id="landing.reviewHeading" />
          </h2>
          <p className="mt-4 max-w-xl leading-7 text-muted">
            <T id="landing.reviewBody" />
          </p>
        </div>
        <ul className="border-l-2 border-brand pl-6 text-sm leading-6">
          <li className="border-b border-line py-4 first:pt-0">
            <T id="landing.reviewPointOne" />
          </li>
          <li className="border-b border-line py-4">
            <T id="landing.reviewPointTwo" />
          </li>
          <li className="py-4 last:pb-0">
            <T id="landing.reviewPointThree" />
          </li>
        </ul>
      </section>

      <section
        id="pricing"
        aria-labelledby="pricing-heading"
        className="grid scroll-mt-20 gap-10 border-t border-line py-16 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16"
      >
        <div>
          <h2 id="pricing-heading" className="max-w-md text-3xl font-semibold tracking-tight">
            <T id="landing.pricingHeading" />
          </h2>
          <p className="mt-4 max-w-md leading-7 text-muted">
            <T id="landing.pricingSubheading" />
          </p>
          <Link
            href="/signup"
            className="mt-7 inline-flex min-h-12 items-center justify-center rounded-lg bg-ink px-5 text-sm font-semibold text-paper transition hover:opacity-90"
          >
            <T id="landing.pricingCta" />
          </Link>
          <p className="mt-3 max-w-md text-sm leading-6 text-muted">
            <Link href="/billing" className="text-brand underline-offset-4 hover:underline">
              <T id="landing.billingGuide" />
            </Link>
            .
          </p>
        </div>

        <div className="border-t border-line">
          {packs.map((pack) => (
            <div
              key={pack.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-5 gap-y-1 border-b border-line py-5 sm:grid-cols-[minmax(0,1fr)_8rem_7rem]"
            >
              <div>
                <p className="font-semibold">{pack.name}</p>
                <p className="text-sm text-muted">
                  {pack.credits.toLocaleString()} <T id="landing.creditsLabel" />
                </p>
              </div>
              <p className="col-span-2 row-start-2 text-sm text-muted sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:text-left">
                {pricePerCredit(pack.amountUsdCents, pack.credits)} <T id="landing.perCreditLabel" />
              </p>
              <p className="col-start-2 row-start-1 text-right text-lg font-semibold sm:col-start-3">
                ${(pack.amountUsdCents / 100).toFixed(2)}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
