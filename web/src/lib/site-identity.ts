import "server-only";

export const POLICY_LAST_UPDATED_ISO = "2026-08-24";
export const POLICY_LAST_UPDATED = "24 August 2026";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function optionalEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function emailEnv(name: string): string | null {
  const value = optionalEnv(name);
  return value && EMAIL_PATTERN.test(value) ? value : null;
}

function retentionDays(): number {
  const value = Number(process.env.AUDIO_RETENTION_DAYS ?? "7");
  return Number.isInteger(value) && value >= 0 ? value : 7;
}

export type SiteIdentity = {
  legalEntityName: string | null;
  supportEmail: string | null;
  privacyEmail: string | null;
  privacyContactEmail: string | null;
  audioRetentionDays: number;
  automaticTaxEnabled: boolean;
};

/** Public, deployment-specific identity and policy settings. */
export function getSiteIdentity(): SiteIdentity {
  const supportEmail = emailEnv("SUPPORT_EMAIL");
  const privacyEmail = emailEnv("PRIVACY_EMAIL");
  return {
    legalEntityName: optionalEnv("LEGAL_ENTITY_NAME"),
    supportEmail,
    privacyEmail,
    privacyContactEmail: privacyEmail ?? supportEmail,
    audioRetentionDays: retentionDays(),
    automaticTaxEnabled:
      process.env.STRIPE_AUTOMATIC_TAX === "1" ||
      process.env.STRIPE_AUTOMATIC_TAX?.toLowerCase() === "true",
  };
}

export function emailHref(email: string, subject?: string): string {
  return subject
    ? `mailto:${email}?subject=${encodeURIComponent(subject)}`
    : `mailto:${email}`;
}
