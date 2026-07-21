import Link from "next/link";
import { T } from "@/components/T";
import { getSettings } from "@/lib/settings";

export default async function Home() {
  const { tiers, packs, signupBonusCredits } = await getSettings();
  const steps = [
    { n: "01", tKey: "step1", body: { credits: signupBonusCredits } },
    { n: "02", tKey: "step2", body: undefined },
    { n: "03", tKey: "step3", body: undefined },
  ] as const;

  return (
    <div>
      {/* Hero */}
      <section className="mx-auto max-w-3xl pt-20 pb-16 text-center sm:pt-28">
        <span className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 text-xs text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-brand" />
          <T id="landing.badge" />
        </span>
        <h1 className="mt-6 text-balance text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
          <T id="landing.heroTitle" />
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-muted">
          <T id="landing.heroSubtitle" />
        </p>
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/signup"
            className="w-full rounded-lg bg-ink px-6 py-3 text-sm font-medium text-paper transition hover:opacity-90 sm:w-auto"
          >
            <T id="landing.ctaPrimary" vars={{ credits: signupBonusCredits }} />
          </Link>
          <Link
            href="/plans"
            className="w-full rounded-lg border border-line px-6 py-3 text-sm font-medium transition hover:bg-paper-2 sm:w-auto"
          >
            <T id="landing.ctaSecondary" />
          </Link>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-line py-16">
        <div className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3">
          {steps.map((s) => (
            <div key={s.n} className="bg-paper p-8">
              <span className="font-mono text-sm text-brand">{s.n}</span>
              <h3 className="mt-3 text-lg font-medium">
                <T id={`landing.${s.tKey}Title`} />
              </h3>
              <p className="mt-2 text-sm text-muted">
                <T id={`landing.${s.tKey}Body`} vars={s.body} />
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Quality */}
      <section className="border-t border-line py-16">
        <h2 className="text-2xl font-semibold tracking-tight">
          <T id="landing.qualityHeading" />
        </h2>
        <p className="mt-2 text-muted">
          <T id="landing.qualitySubheading" />
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {Object.entries(tiers).map(([id, tier]) => (
            <div key={id} className="rounded-2xl border border-line p-7">
              <div className="flex items-baseline justify-between">
                <h3 className="text-lg font-medium">{tier.label}</h3>
                <span className="text-sm text-muted">
                  {tier.creditsPerMinute} credit{tier.creditsPerMinute > 1 ? "s" : ""}
                  <T id="landing.creditsPerMinSuffix" />
                </span>
              </div>
              <p className="mt-3 text-sm text-muted">{tier.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="border-t border-line py-16">
        <h2 className="text-2xl font-semibold tracking-tight">
          <T id="landing.pricingHeading" />
        </h2>
        <p className="mt-2 text-muted">
          <T id="landing.pricingSubheading" />
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {packs.map((pack, i) => (
            <div
              key={pack.id}
              className={`relative rounded-2xl border p-7 ${
                i === 1 ? "border-brand shadow-sm" : "border-line"
              }`}
            >
              {i === 1 && (
                <span className="absolute -top-2.5 left-7 rounded-full bg-brand px-2.5 py-0.5 text-xs font-medium text-brand-ink">
                  <T id="landing.mostPopular" />
                </span>
              )}
              <h3 className="text-sm font-medium text-muted">{pack.name}</h3>
              <p className="mt-2 text-4xl font-semibold tracking-tight">{pack.credits}</p>
              <p className="text-sm text-muted">
                <T id="landing.creditsLabel" />
              </p>
              <p className="mt-4 text-lg">${(pack.amountUsdCents / 100).toFixed(2)}</p>
            </div>
          ))}
        </div>
        <div className="mt-10">
          <Link
            href="/signup"
            className="inline-block rounded-lg bg-ink px-6 py-3 text-sm font-medium text-paper transition hover:opacity-90"
          >
            <T id="landing.pricingCta" />
          </Link>
        </div>
      </section>
    </div>
  );
}
