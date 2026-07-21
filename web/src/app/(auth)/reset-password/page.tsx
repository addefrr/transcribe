import Link from "next/link";
import ResetPasswordForm from "@/components/ResetPasswordForm";

export const metadata = { title: "Reset your password — Transcribe" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  if (!token) {
    return (
      <div className="mx-auto mt-16 w-full max-w-sm rounded-xl border border-line p-8">
        <h1 className="mb-2 text-2xl font-semibold">Invalid link</h1>
        <p className="text-sm text-muted">
          This password-reset link is missing or malformed.{" "}
          <Link href="/forgot-password" className="text-brand hover:underline">
            Request a new one
          </Link>
          .
        </p>
      </div>
    );
  }
  return <ResetPasswordForm token={token} />;
}
