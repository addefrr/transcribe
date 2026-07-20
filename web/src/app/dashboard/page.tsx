import Link from "next/link";
import { redirect } from "next/navigation";
import JobList from "@/components/JobList";
import NewJobForm from "@/components/NewJobForm";
import { getCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";

export const metadata = { title: "My transcriptions — Transcribe" };

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { tiers, usdCentsPerCredit } = await getSettings();

  return (
    <div className="py-10">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">My transcriptions</h1>
        <p className="text-sm text-zinc-500">
          You have{" "}
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">
            {user.creditBalance} credits
          </span>{" "}
          left{" "}
          <Link href="/credits" className="ml-2 text-indigo-600 hover:underline dark:text-indigo-400">
            Get more
          </Link>
        </p>
      </div>
      <NewJobForm tiers={tiers} usdCentsPerCredit={usdCentsPerCredit} />
      <JobList />
    </div>
  );
}
