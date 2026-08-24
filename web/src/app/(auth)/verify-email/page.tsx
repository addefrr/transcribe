import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { confirmEmailVerification } from "../actions";

export const metadata = {
  title: "Verify your email",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; status?: string }>;
}) {
  const { token, status } = await searchParams;
  const user = await getCurrentUser();
  const ok = status === "verified" || user?.emailVerified === true;
  const invalid = status === "invalid";

  return (
    <div className="mx-auto mt-16 w-full max-w-sm rounded-xl border border-line p-8 text-center">
      {ok ? (
        <>
          <div
            aria-hidden="true"
            className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-brand/15 text-brand"
          >
            <svg viewBox="0 0 24 24" className="size-6" fill="none">
              <path d="m5 12.5 4.25 4.25L19 7" stroke="currentColor" strokeWidth="2" />
            </svg>
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
      ) : token && !invalid ? (
        <>
          <h1 className="text-2xl font-semibold">Confirm your email</h1>
          <p className="mt-2 text-sm text-muted">
            Confirming proves you control this address and unlocks any advertised trial credits.
          </p>
          <form action={confirmEmailVerification} className="mt-6">
            <input type="hidden" name="token" value={token} />
            <button type="submit" className="button-primary w-full">
              Verify email
            </button>
          </form>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold">
            {invalid ? "Link expired" : "Verification link needed"}
          </h1>
          <p className="mt-2 text-sm text-muted">
            {invalid
              ? "This verification link is invalid, expired, or has already been used."
              : "Open the verification link from your email to continue."}
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
