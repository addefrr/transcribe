import { redirect } from "next/navigation";
import BatchDetail from "@/components/BatchDetail";
import { getCurrentUser } from "@/lib/auth";

export const metadata = { title: "Playlist — Transcribe" };

export default async function BatchPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  return (
    <div className="py-10">
      <BatchDetail id={id} />
    </div>
  );
}
