import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import { T } from "@/components/T";
import { getCurrentUser } from "@/lib/auth";
import { safeReturnPath } from "@/lib/return-path";
import { login } from "../actions";

export const metadata = { title: "Log in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string; verified?: string; next?: string }>;
}) {
  const { reset, verified, next } = await searchParams;
  const returnTo = safeReturnPath(next, "") || undefined;
  if (await getCurrentUser()) redirect(returnTo ?? "/dashboard");
  return (
    <AuthForm
      title={<T id="auth.loginTitle" />}
      cta={<T id="auth.loginCta" />}
      action={login}
      altText={<T id="auth.loginAlt" />}
      altHref={returnTo ? `/signup?next=${encodeURIComponent(returnTo)}` : "/signup"}
      altLink={<T id="auth.loginAltLink" />}
      forgotHref="/forgot-password"
      returnTo={returnTo}
      notice={reset ? <T id="auth.resetNotice" /> : verified ? <T id="auth.verifiedNotice" /> : undefined}
    />
  );
}
