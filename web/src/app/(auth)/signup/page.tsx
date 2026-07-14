import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import { getCurrentUser } from "@/lib/auth";
import { SIGNUP_BONUS_CREDITS } from "@/lib/pricing";
import { signup } from "../actions";

export const metadata = { title: "Sign up — Transcribe" };

export default async function SignupPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  return (
    <AuthForm
      title={`Create your account${SIGNUP_BONUS_CREDITS > 0 ? ` — get ${SIGNUP_BONUS_CREDITS} free credits` : ""}`}
      cta="Sign up"
      action={signup}
      altText="Already have an account?"
      altHref="/login"
      altLink="Log in"
    />
  );
}
