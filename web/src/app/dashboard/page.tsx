import Link from "next/link";
import { redirect } from "next/navigation";
import JobList from "@/components/JobList";
import NewJobForm from "@/components/NewJobForm";
import { getCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { getActiveSubscription, remainingMinutes } from "@/lib/subscriptions";

export const metadata = { title: "My transcriptions — Transcribe" };

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { tiers, usdCentsPerCredit } = await getSettings();
  const sub = await getActiveSubscription(user.id);

  return (
    <div className="py-10">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">My transcriptions</h1>
        {sub ? (
          <p className="text-sm text-muted">
            <span className="font-semibold capitalize text-ink">
              {sub.tier} plan
            </span>{" "}
            · {Math.round(remainingMinutes(sub) / 60)}h left this period
          </p>
        ) : (
          <p className="text-sm text-muted">
            You have{" "}
            <span className="font-semibold text-ink">
              {user.creditBalance} credits
            </span>{" "}
            left{" "}
            <Link href="/plans" className="ml-2 text-brand hover:underline dark:text-brand">
              Go unlimited
            </Link>
          </p>
        )}
      </div>
      <NewJobForm tiers={tiers} usdCentsPerCredit={usdCentsPerCredit} />
      <JobList />
    </div>
  );
}
