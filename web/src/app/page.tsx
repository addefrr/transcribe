import Link from "next/link";
import { PACKS, SIGNUP_BONUS_CREDITS, TIERS } from "@/lib/pricing";

export default function Home() {
  return (
    <div className="py-16">
      <section className="mx-auto max-w-2xl text-center">
        <h1 className="text-4xl font-bold leading-tight sm:text-5xl">
          Accurate transcripts,
          <br />
          <span className="text-indigo-600 dark:text-indigo-400">pay only for what you use.</span>
        </h1>
        <p className="mt-6 text-lg text-zinc-600 dark:text-zinc-400">
          Upload audio or video — or paste a link (YouTube included) — and get a
          Whisper-powered transcript with timestamps, SRT and VTT export. No
          subscription: buy credits, spend them by the minute.
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <Link
            href="/signup"
            className="rounded-md bg-indigo-600 px-6 py-3 font-medium text-white hover:bg-indigo-500"
          >
            Start free with {SIGNUP_BONUS_CREDITS} credits
          </Link>
        </div>
      </section>

      <section className="mx-auto mt-20 grid max-w-3xl gap-6 sm:grid-cols-2">
        {Object.entries(TIERS).map(([id, tier]) => (
          <div key={id} className="rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
            <h3 className="text-lg font-semibold">{tier.label}</h3>
            <p className="mt-1 text-2xl font-bold">
              {tier.creditsPerMinute}{" "}
              <span className="text-sm font-normal">
                credit{tier.creditsPerMinute > 1 ? "s" : ""}/minute
              </span>
            </p>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{tier.description}</p>
          </div>
        ))}
      </section>

      <section className="mx-auto mt-16 max-w-3xl text-center">
        <h2 className="text-xl font-semibold">Credit packs</h2>
        <div className="mt-6 grid gap-6 sm:grid-cols-3">
          {PACKS.map((pack) => (
            <div
              key={pack.id}
              className="rounded-xl border border-zinc-200 p-6 dark:border-zinc-800"
            >
              <h3 className="font-semibold">{pack.name}</h3>
              <p className="mt-1 text-2xl font-bold">{pack.credits}</p>
              <p className="text-sm text-zinc-500">credits</p>
              <p className="mt-2 text-lg">${(pack.amountUsdCents / 100).toFixed(2)}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 text-sm text-zinc-500">
          1 credit ≈ 1 minute of standard transcription.
        </p>
      </section>
    </div>
  );
}
