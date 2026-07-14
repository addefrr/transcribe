import Stripe from "stripe";

let client: Stripe | null = null;

/** Returns null when STRIPE_SECRET_KEY isn't configured. */
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  client ??= new Stripe(key);
  return client;
}

export const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
