import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import { fill } from "@/lib/content";
import { getCurrentUser } from "@/lib/auth";
import { getContent, getSettings } from "@/lib/settings";
import { signup } from "../actions";

export const metadata = { title: "Sign up — Transcribe" };

export default async function SignupPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  const { signupBonusCredits } = await getSettings();
  const c = (await getContent()).auth;
  return (
    <AuthForm
      title={
        signupBonusCredits > 0
          ? fill(c.signupTitleBonus, { credits: signupBonusCredits })
          : c.signupTitle
      }
      cta={c.signupCta}
      action={signup}
      altText={c.signupAlt}
      altHref="/login"
      altLink={c.signupAltLink}
    />
  );
}
