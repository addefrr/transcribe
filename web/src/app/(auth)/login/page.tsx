import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import { getCurrentUser } from "@/lib/auth";
import { getContent } from "@/lib/settings";
import { login } from "../actions";

export const metadata = { title: "Log in — Transcribe" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string; verified?: string }>;
}) {
  if (await getCurrentUser()) redirect("/dashboard");
  const { reset, verified } = await searchParams;
  const c = (await getContent()).auth;
  const notice = reset ? c.resetNotice : verified ? c.verifiedNotice : undefined;
  return (
    <AuthForm
      title={c.loginTitle}
      cta={c.loginCta}
      action={login}
      altText={c.loginAlt}
      altHref="/signup"
      altLink={c.loginAltLink}
      forgotHref="/forgot-password"
      notice={notice}
    />
  );
}
