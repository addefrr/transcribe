import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import { getCurrentUser } from "@/lib/auth";
import { login } from "../actions";

export const metadata = { title: "Log in — Transcribe" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string; verified?: string }>;
}) {
  if (await getCurrentUser()) redirect("/dashboard");
  const { reset, verified } = await searchParams;
  const notice = reset
    ? "Your password has been updated. Please log in."
    : verified
      ? "Your email is verified. Please log in."
      : undefined;
  return (
    <AuthForm
      title="Welcome back"
      cta="Log in"
      action={login}
      altText="New here?"
      altHref="/signup"
      altLink="Create an account"
      forgotHref="/forgot-password"
      notice={notice}
    />
  );
}
