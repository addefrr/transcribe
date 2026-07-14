import Link from "next/link";
import { redirect } from "next/navigation";
import JobList from "@/components/JobList";
import NewJobForm from "@/components/NewJobForm";
import { getCurrentUser } from "@/lib/auth";

export const metadata = { title: "Dashboard — Transcribe" };

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="py-10">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-zinc-500">
          Balance: <span className="font-semibold text-zinc-900 dark:text-zinc-100">{user.creditBalance} credits</span>{" "}
          <Link href="/credits" className="ml-2 text-indigo-600 hover:underline dark:text-indigo-400">
            Buy more
          </Link>
        </p>
      </div>
      <NewJobForm />
      <JobList />
    </div>
  );
}
