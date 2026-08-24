"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createApiToken, listApiTokens, revokeApiToken } from "@/lib/apiTokens";
import { getCurrentUser } from "@/lib/auth";
import { isUuid } from "@/lib/uuid";

// On success `token` holds the raw secret to show ONCE; `name` labels it. On
// failure `error` is set. useActionState in TokenManager renders whichever.
export type TokenState = { token?: string; name?: string; error?: string };

export async function createToken(_prev: TokenState, formData: FormData): Promise<TokenState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.emailVerified) return { error: "Verify your email before creating an API token." };

  if ((await listApiTokens(user.id)).length >= 10) {
    return { error: "You can keep up to 10 tokens. Revoke one before creating another." };
  }

  const name = String(formData.get("name") ?? "").trim().slice(0, 60);
  if (!name) return { error: "Give the token a name so you can recognize it later." };

  const { token } = await createApiToken(user.id, name);
  revalidatePath("/tokens");
  return { token, name };
}

export async function revokeToken(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const id = String(formData.get("id") ?? "");
  if (isUuid(id)) await revokeApiToken(user.id, id);
  revalidatePath("/tokens");
}
