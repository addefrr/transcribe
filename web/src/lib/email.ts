// Transactional email via Resend's REST API (no SDK dependency). When
// RESEND_API_KEY is unset — local dev, tests — emails are logged to the server
// console instead of sent, so the auth flows work without a live provider.

type Mail = { to: string; subject: string; html: string; text: string };

const FROM = process.env.EMAIL_FROM ?? "Transcribe <onboarding@resend.dev>";

export function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export async function sendEmail(mail: Mail): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(
      `\n[email:dev] would send to ${mail.to}\n  subject: ${mail.subject}\n  ${mail.text.replace(/\n/g, "\n  ")}\n`,
    );
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to: mail.to,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend send failed (${res.status}): ${body}`);
  }
}

// A minimal, on-brand HTML wrapper. Kept inline so the whole email is one file.
export function emailLayout(heading: string, bodyHtml: string, cta?: { href: string; label: string }): string {
  const button = cta
    ? `<a href="${cta.href}" style="display:inline-block;background:#5b50e0;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;font-size:14px">${cta.label}</a>`
    : "";
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#0a0a0b">
    <div style="font-weight:700;font-size:18px;margin-bottom:24px">Transcribe</div>
    <h1 style="font-size:20px;margin:0 0 12px">${heading}</h1>
    <div style="font-size:14px;line-height:1.6;color:#3f3f46">${bodyHtml}</div>
    ${button ? `<div style="margin:24px 0">${button}</div>` : ""}
    <div style="margin-top:32px;font-size:12px;color:#9c9ca6">Transcribe — audio &amp; video to text</div>
  </div>`;
}
