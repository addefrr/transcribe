"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  createSession,
  destroySession,
  getCurrentUser,
  hashPassword,
  verifyPassword,
} from "@/lib/auth";
import { grantCredits } from "@/lib/credits";
import { db } from "@/lib/db";
import { appUrl, emailLayout, sendEmail } from "@/lib/email";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { getSettings } from "@/lib/settings";
import { sessions, users } from "@/lib/schema";
import { createAuthToken, consumeAuthToken } from "@/lib/tokens";

export type AuthState = { error?: string; notice?: string };

const HOUR = 3600 * 1000;

// argon2id hash of an unused password, for constant-time-ish login failures.
const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$lFk75WW82LABRvZhgtwMUA$lqtEWeA7nK5SxX8jsAz3MKXjzV3uE6SElaLWQsiMJgs";

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

const emailSchema = z.string().trim().toLowerCase().email();

async function sendVerificationEmail(userId: string, email: string): Promise<void> {
  const token = await createAuthToken(userId, "verify", 24 * HOUR);
  const link = `${appUrl()}/verify-email?token=${token}`;
  try {
    await sendEmail({
      to: email,
      subject: "Verify your email — Transcribe",
      text: `Welcome to Transcribe! Confirm your email address:\n${link}\n\nThis link expires in 24 hours.`,
      html: emailLayout(
        "Verify your email",
        "Welcome to Transcribe! Confirm your email address to secure your account. This link expires in 24 hours.",
        { href: link, label: "Verify email" },
      ),
    });
  } catch (err) {
    // Never block the user on a mail-provider hiccup — they can resend later.
    console.error("verification email failed:", err);
  }
}

export async function signup(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const limit = rateLimit(`signup:${await clientIp()}`, 10, HOUR);
  if (!limit.ok) {
    return { error: "Too many sign-ups from this network. Please try again later." };
  }

  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }
  const { email, password } = parsed.data;

  const passwordHash = await hashPassword(password);
  let userId: string;
  try {
    const [row] = await db
      .insert(users)
      .values({ email, passwordHash })
      .returning({ id: users.id });
    userId = row.id;
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      return { error: "An account with that email already exists." };
    }
    throw err; // real DB failure — don't misreport it as a duplicate email
  }

  const { signupBonusCredits } = await getSettings();
  if (signupBonusCredits > 0) {
    await grantCredits(userId, signupBonusCredits, "signup_bonus");
  }
  await sendVerificationEmail(userId, email);
  await createSession(userId);
  redirect("/dashboard");
}

export async function login(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = emailSchema.safeParse(formData.get("email"));
  // Rate-limit by IP and, when present, by target email — throttles both broad
  // and targeted brute-force without locking a victim out globally.
  const ip = await clientIp();
  const ipLimit = rateLimit(`login:ip:${ip}`, 20, 15 * 60 * 1000);
  const emailLimit = email.success
    ? rateLimit(`login:email:${email.data}`, 8, 15 * 60 * 1000)
    : { ok: true, retryAfterSec: 0 };
  if (!ipLimit.ok || !emailLimit.ok) {
    return { error: "Too many attempts. Please wait a few minutes and try again." };
  }

  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "Invalid email or password." };
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, parsed.data.email))
    .limit(1);
  // Verify against a dummy hash when the email is unknown so response time
  // doesn't reveal which accounts exist.
  const ok = await verifyPassword(user?.passwordHash ?? DUMMY_PASSWORD_HASH, parsed.data.password);
  if (!user || !ok) {
    return { error: "Invalid email or password." };
  }
  await createSession(user.id);
  redirect("/dashboard");
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/");
}

// --- Password reset ---------------------------------------------------------

const GENERIC_RESET_NOTICE =
  "If an account exists for that email, we've sent a link to reset your password.";

export async function requestPasswordReset(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = emailSchema.safeParse(formData.get("email"));
  const ip = await clientIp();
  const limited =
    !rateLimit(`reset:ip:${ip}`, 10, HOUR).ok ||
    (email.success && !rateLimit(`reset:email:${email.data}`, 5, HOUR).ok);
  if (limited) {
    return { error: "Too many requests. Please try again later." };
  }

  // Always report the same result so we don't reveal which emails have accounts.
  if (!email.success) return { notice: GENERIC_RESET_NOTICE };

  const [user] = await db.select().from(users).where(eq(users.email, email.data)).limit(1);
  if (user) {
    const token = await createAuthToken(user.id, "reset", HOUR);
    const link = `${appUrl()}/reset-password?token=${token}`;
    try {
      await sendEmail({
        to: user.email,
        subject: "Reset your password — Transcribe",
        text: `Reset your Transcribe password:\n${link}\n\nThis link expires in 1 hour. If you didn't ask for this, you can ignore this email.`,
        html: emailLayout(
          "Reset your password",
          "Click below to choose a new password. This link expires in 1 hour. If you didn't request it, you can safely ignore this email.",
          { href: link, label: "Reset password" },
        ),
      });
    } catch (err) {
      console.error("reset email failed:", err);
    }
  }
  return { notice: GENERIC_RESET_NOTICE };
}

const resetSchema = z.object({
  token: z.string().min(16),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export async function resetPassword(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = resetSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const userId = await consumeAuthToken(parsed.data.token, "reset");
  if (!userId) {
    return { error: "This reset link is invalid or has expired. Please request a new one." };
  }

  const passwordHash = await hashPassword(parsed.data.password);
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
  // Revoke every existing session — a reset should log out other devices.
  await db.delete(sessions).where(eq(sessions.userId, userId));
  redirect("/login?reset=1");
}

// --- Email verification -----------------------------------------------------

export async function resendVerification(
  _prev: AuthState,
  _formData: FormData,
): Promise<AuthState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Please sign in first." };
  if (user.emailVerified) return { notice: "Your email is already verified." };
  if (!rateLimit(`verify:${user.id}`, 5, HOUR).ok) {
    return { error: "Please wait a bit before requesting another email." };
  }
  await sendVerificationEmail(user.id, user.email);
  return { notice: "Verification email sent — check your inbox." };
}
