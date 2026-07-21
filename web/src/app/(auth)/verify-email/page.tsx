import { eq } from "drizzle-orm";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { consumeAuthToken } from "@/lib/tokens";

export const metadata = { title: "Verify your email — Transcribe" };
export const dynamic = "force-dynamic";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const user = await getCurrentUser();

  let ok = false;
  if (token) {
    const userId = await consumeAuthToken(token, "verify");
    if (userId) {
      await db.update(users).set({ emailVerified: true }).where(eq(users.id, userId));
      ok = true;
    }
  }
  // Already-verified users who revisit a spent link still see success.
  if (!ok && user?.emailVerified) ok = true;

  return (
    <div className="mx-auto mt-16 w-full max-w-sm rounded-xl border border-line p-8 text-center">
      {ok ? (
        <>
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-brand/15 text-2xl text-brand">
            ✓
          </div>
          <h1 className="text-2xl font-semibold">Email verified</h1>
          <p className="mt-2 text-sm text-muted">Thanks — your account is all set.</p>
          <Link
            href={user ? "/dashboard" : "/login"}
            className="mt-6 inline-block rounded-md bg-brand px-5 py-2 text-sm font-medium text-brand-ink hover:opacity-90"
          >
            {user ? "Go to dashboard" : "Log in"}
          </Link>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold">Link expired</h1>
          <p className="mt-2 text-sm text-muted">
            This verification link is invalid or has already been used.
            {user
              ? " You can request a new one from your dashboard."
              : " Log in and we'll send a fresh one."}
          </p>
          <Link
            href={user ? "/dashboard" : "/login"}
            className="mt-6 inline-block rounded-md border border-line px-5 py-2 text-sm font-medium hover:border-brand"
          >
            {user ? "Go to dashboard" : "Log in"}
          </Link>
        </>
      )}
    </div>
  );
}
