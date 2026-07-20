import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { creditLedger } from "@/lib/schema";

export const metadata = { title: "Your credits — Transcribe" };

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
  const { packs } = await getSettings();

  const ledger = await db
    .select()
    .from(creditLedger)
    .where(eq(creditLedger.userId, user.id))
    .orderBy(desc(creditLedger.createdAt))
    .limit(25);

  return (
    <div className="py-10">
      <h1 className="text-2xl font-semibold">Your credits</h1>
      <p className="mt-1 text-zinc-500">
        You have{" "}
        <span className="font-semibold text-zinc-900 dark:text-zinc-100">
          {user.creditBalance} credits
        </span>{" "}
        — about {user.creditBalance} minutes of Standard transcription.
      </p>

      {params.success && (
        <p className="mt-4 rounded-md bg-green-100 px-4 py-2 text-sm text-green-800 dark:bg-green-950 dark:text-green-300">
          Thank you! Your credits have been added. (It can take a few seconds to appear.)
        </p>
      )}
      {params.canceled && (
        <p className="mt-4 rounded-md bg-amber-100 px-4 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
          No problem — nothing was charged.
        </p>
      )}

      <div className="mt-8 grid gap-6 sm:grid-cols-3">
        {packs.map((pack) => (
          <form
            key={pack.id}
            action="/api/stripe/checkout"
            method="POST"
            className="rounded-xl border border-zinc-200 p-6 text-center dark:border-zinc-800"
          >
            <input type="hidden" name="packId" value={pack.id} />
            <h3 className="font-semibold">{pack.name}</h3>
            <p className="mt-1 text-3xl font-bold">{pack.credits}</p>
            <p className="text-sm text-zinc-500">credits</p>
            <button
              type="submit"
              className="mt-4 w-full rounded-md bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-500"
            >
              Buy for ${(pack.amountUsdCents / 100).toFixed(2)}
            </button>
          </form>
        ))}
      </div>

      <h2 className="mt-12 text-lg font-semibold">Activity</h2>
      {ledger.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-500">Nothing here yet.</p>
      ) : (
        <table className="mt-4 w-full max-w-xl text-left text-sm">
          <tbody>
            {ledger.map((row) => (
              <tr key={row.id} className="border-b border-zinc-100 dark:border-zinc-900">
                <td className="py-2 pr-4 text-zinc-500">
                  {row.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                </td>
                <td className="py-2 pr-4">{REASON_LABELS[row.reason] ?? row.reason}</td>
                <td
                  className={`py-2 text-right font-mono ${row.delta >= 0 ? "text-green-600" : "text-zinc-500"}`}
                >
                  {row.delta > 0 ? `+${row.delta}` : row.delta}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
