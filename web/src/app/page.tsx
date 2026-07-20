import Link from "next/link";
import { getSettings } from "@/lib/settings";

export default async function Home() {
  const { tiers, packs, signupBonusCredits } = await getSettings();
  const STEPS = [
    {
      emoji: "✨",
      title: "Add credits",
      body: `Start with ${signupBonusCredits} free credits when you sign up. Top up any time — no subscription.`,
    },
    {
      emoji: "⬆️",
      title: "Add your audio or video",
      body: "Upload a file, or paste a link — including YouTube. We handle the rest.",
    },
    {
      emoji: "📄",
      title: "Get your transcript",
      body: "Read it online with timestamps, or download it as a text or subtitle file.",
    },
  ];
  return (
    <div className="py-16">
      <section className="mx-auto max-w-2xl text-center">
        <h1 className="text-4xl font-bold leading-tight sm:text-5xl">
          Turn audio &amp; video
          <br />
          <span className="text-indigo-600 dark:text-indigo-400">into text in minutes.</span>
        </h1>
        <p className="mt-6 text-lg text-zinc-600 dark:text-zinc-400">
          Upload a recording or paste a link and get a clean, accurate transcript you
          can read, search and download. Pay only for what you use — no monthly fee.
        </p>
        <div className="mt-8 flex justify-center">
          <Link
            href="/signup"
            className="rounded-md bg-indigo-600 px-6 py-3 font-medium text-white hover:bg-indigo-500"
          >
            Get started — {signupBonusCredits} free credits
          </Link>
        </div>
        <p className="mt-3 text-sm text-zinc-500">No card required to try it.</p>
      </section>

      <section className="mx-auto mt-20 max-w-4xl">
        <h2 className="text-center text-xl font-semibold">How it works</h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <div key={i} className="rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
              <div className="text-3xl">{step.emoji}</div>
              <h3 className="mt-3 font-semibold">
                {i + 1}. {step.title}
              </h3>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-20 max-w-3xl">
        <h2 className="text-center text-xl font-semibold">Choose the quality that fits</h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {Object.entries(tiers).map(([id, tier]) => (
            <div key={id} className="rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
              <h3 className="text-lg font-semibold">{tier.label}</h3>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{tier.description}</p>
              <p className="mt-4 text-sm text-zinc-500">
                {tier.creditsPerMinute} credit{tier.creditsPerMinute > 1 ? "s" : ""} per minute of
                audio
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-20 max-w-3xl text-center">
        <h2 className="text-xl font-semibold">Simple credit packs</h2>
        <p className="mt-2 text-sm text-zinc-500">
          One credit covers about a minute of audio. Buy what you need, whenever you need it.
        </p>
        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          {packs.map((pack, i) => (
            <div
              key={pack.id}
              className={`rounded-xl border p-6 ${
                i === 1
                  ? "border-indigo-500 ring-1 ring-indigo-500"
                  : "border-zinc-200 dark:border-zinc-800"
              }`}
            >
              {i === 1 && (
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">
                  Most popular
                </p>
              )}
              <h3 className="font-semibold">{pack.name}</h3>
              <p className="mt-1 text-3xl font-bold">{pack.credits}</p>
              <p className="text-sm text-zinc-500">credits</p>
              <p className="mt-2 text-lg">${(pack.amountUsdCents / 100).toFixed(2)}</p>
            </div>
          ))}
        </div>
        <div className="mt-10">
          <Link
            href="/signup"
            className="rounded-md bg-indigo-600 px-6 py-3 font-medium text-white hover:bg-indigo-500"
          >
            Create your free account
          </Link>
        </div>
      </section>
    </div>
  );
}
