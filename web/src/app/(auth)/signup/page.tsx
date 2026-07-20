import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import { getCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { signup } from "../actions";

export const metadata = { title: "Sign up — Transcribe" };

export default async function SignupPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  const { signupBonusCredits } = await getSettings();
  return (
    <AuthForm
      title={`Create your account${signupBonusCredits > 0 ? ` — get ${signupBonusCredits} free credits` : ""}`}
      cta="Sign up"
      action={signup}
      altText="Already have an account?"
      altHref="/login"
      altLink="Log in"
    />
  );
}
