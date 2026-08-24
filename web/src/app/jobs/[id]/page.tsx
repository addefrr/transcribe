import { redirect } from "next/navigation";
import JobDetail from "@/components/JobDetail";
import { getCurrentUser } from "@/lib/auth";

export const metadata = { title: "Transcript job" };

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  return (
    <div className="py-10">
      <JobDetail id={id} />
    </div>
  );
}
