import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import { T } from "@/components/T";
import { getCurrentUser } from "@/lib/auth";
import { safeReturnPath } from "@/lib/return-path";
import { getSettings } from "@/lib/settings";
import { signup } from "../actions";

export const metadata = { title: "Sign up" };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const returnTo = safeReturnPath(next, "") || undefined;
  if (await getCurrentUser()) redirect(returnTo ?? "/dashboard");
  const { signupBonusCredits } = await getSettings();
  return (
    <AuthForm
      title={
        signupBonusCredits > 0
          ? <T id="auth.signupTitleBonus" vars={{ credits: signupBonusCredits }} />
          : <T id="auth.signupTitle" />
      }
      cta={<T id="auth.signupCta" />}
      action={signup}
      altText={<T id="auth.signupAlt" />}
      altHref={returnTo ? `/login?next=${encodeURIComponent(returnTo)}` : "/login"}
      altLink={<T id="auth.signupAltLink" />}
      returnTo={returnTo}
    />
  );
}
