import Link from "next/link";
import { redirect } from "next/navigation";
import JobList from "@/components/JobList";
import NewJobForm from "@/components/NewJobForm";
import { fill } from "@/lib/content";
import { getCurrentUser } from "@/lib/auth";
import { getContent, getSettings } from "@/lib/settings";
import { getActiveSubscription, remainingMinutes } from "@/lib/subscriptions";

export const metadata = { title: "My transcriptions — Transcribe" };

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { tiers, usdCentsPerCredit } = await getSettings();
  const c = (await getContent()).dashboard;
  const sub = await getActiveSubscription(user.id);

  return (
    <div className="py-10">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{c.heading}</h1>
        {sub ? (
          <p className="text-sm text-muted">
            <span className="font-semibold capitalize text-ink">
              {fill(c.planLeft, { plan: sub.tier })}
            </span>{" "}
            · {fill(c.periodLeft, { hours: Math.round(remainingMinutes(sub) / 60) })}
          </p>
        ) : (
          <p className="text-sm text-muted">
            {fill(c.creditsLeft, { credits: user.creditBalance })}{" "}
            <Link href="/plans" className="ml-2 text-brand hover:underline">
              {c.goUnlimited}
            </Link>
          </p>
        )}
      </div>
      <NewJobForm tiers={tiers} usdCentsPerCredit={usdCentsPerCredit} />
      <JobList />
    </div>
  );
}
