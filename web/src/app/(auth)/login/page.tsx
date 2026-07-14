import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import { getCurrentUser } from "@/lib/auth";
import { login } from "../actions";

export const metadata = { title: "Log in — Transcribe" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  return (
    <AuthForm
      title="Welcome back"
      cta="Log in"
      action={login}
      altText="New here?"
      altHref="/signup"
      altLink="Create an account"
    />
  );
}
