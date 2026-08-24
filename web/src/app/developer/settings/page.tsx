import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin";
import { getCurrentUser } from "@/lib/auth";
import { getContent, getSettings } from "@/lib/settings";
import SettingsForm from "./SettingsForm";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const user = await getCurrentUser();
  if (!isAdmin(user)) redirect("/dashboard");
  const s = await getSettings();
  const content = await getContent();
  const { saved } = await searchParams;

  return (
    <div className="py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <Link href="/developer" className="text-sm text-brand hover:underline">
          ← Back to portal
        </Link>
      </div>
      <p className="mt-1 text-sm text-muted">
        Changes apply within a few seconds and never affect jobs already in progress.
      </p>
      {saved && (
        <p
          className="mt-4 rounded-md bg-success-soft px-4 py-3 text-sm text-success"
          role="status"
          aria-live="polite"
        >
          Settings saved.
        </p>
      )}
      <SettingsForm settings={s} content={content} />
    </div>
  );
}
