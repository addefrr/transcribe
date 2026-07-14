"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSession, destroySession, hashPassword, verifyPassword } from "@/lib/auth";
import { grantCredits } from "@/lib/credits";
import { db } from "@/lib/db";
import { SIGNUP_BONUS_CREDITS } from "@/lib/pricing";
import { users } from "@/lib/schema";

export type AuthState = { error?: string };

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export async function signup(_prev: AuthState, formData: FormData): Promise<AuthState> {
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
  } catch {
    return { error: "An account with that email already exists." };
  }

  if (SIGNUP_BONUS_CREDITS > 0) {
    await grantCredits(userId, SIGNUP_BONUS_CREDITS, "signup_bonus");
  }
  await createSession(userId);
  redirect("/dashboard");
}

export async function login(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "Invalid email or password." };
  }
  const { email, password } = parsed.data;

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user || !(await verifyPassword(user.passwordHash, password))) {
    return { error: "Invalid email or password." };
  }
  await createSession(user.id);
  redirect("/dashboard");
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/");
}
