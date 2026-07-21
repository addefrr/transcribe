import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import CustomAmount from "@/components/CustomAmount";
import { fill } from "@/lib/content";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getContent, getSettings } from "@/lib/settings";
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
  const { packs, usdCentsPerCredit, minPurchaseUsdCents } = await getSettings();
  const c = (await getContent()).credits;

  const ledger = await db
    .select()
    .from(creditLedger)
    .where(eq(creditLedger.userId, user.id))
    .orderBy(desc(creditLedger.createdAt))
    .limit(25);

  return (
    <div className="py-10">
      <h1 className="text-2xl font-semibold">{c.heading}</h1>
      <p className="mt-1 text-muted">
        {fill(c.balance, { credits: user.creditBalance })}
      </p>

      {params.success && (
        <p className="mt-4 rounded-md bg-green-100 px-4 py-2 text-sm text-green-800 dark:bg-green-950 dark:text-green-300">
          {c.successNotice}
        </p>
      )}
      {params.canceled && (
        <p className="mt-4 rounded-md bg-amber-100 px-4 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
          {c.canceledNotice}
        </p>
      )}

      <div className="mt-8 grid gap-6 sm:grid-cols-3">
        {packs.map((pack) => (
          <form
            key={pack.id}
            action="/api/stripe/checkout"
            method="POST"
            className="rounded-xl border border-line p-6 text-center"
          >
            <input type="hidden" name="packId" value={pack.id} />
            <h3 className="font-semibold">{pack.name}</h3>
            <p className="mt-1 text-3xl font-bold">{pack.credits}</p>
            <p className="text-sm text-muted">{c.creditsWord ?? "credits"}</p>
            <button
              type="submit"
              className="mt-4 w-full rounded-md bg-brand py-2 text-sm font-medium text-brand-ink hover:opacity-90"
            >
              {fill(c.buyCta, { dollars: (pack.amountUsdCents / 100).toFixed(2) })}
            </button>
          </form>
        ))}
      </div>

      <div className="mt-6 max-w-md">
        <CustomAmount
          usdCentsPerCredit={usdCentsPerCredit}
          minPurchaseUsdCents={minPurchaseUsdCents}
        />
      </div>

      <h2 className="mt-12 text-lg font-semibold">{c.activityHeading}</h2>
      {ledger.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{c.activityEmpty}</p>
      ) : (
        <table className="mt-4 w-full max-w-xl text-left text-sm">
          <tbody>
            {ledger.map((row) => (
              <tr key={row.id} className="border-b border-line">
                <td className="py-2 pr-4 text-muted">
                  {row.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                </td>
                <td className="py-2 pr-4">{REASON_LABELS[row.reason] ?? row.reason}</td>
                <td
                  className={`py-2 text-right font-mono ${row.delta >= 0 ? "text-green-600" : "text-muted"}`}
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
