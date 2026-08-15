import nodemailer, { type Transporter } from "nodemailer";

/**
 * Gmail SMTP via an App Password (SMTP_USER / SMTP_APP_PASSWORD). Only ever
 * reached through a dynamic `import("@/lib/email/mailer")` inside a server
 * fn handler — never imported at module top-level from a `*.functions.ts`
 * file, so it never ships to the client bundle (nodemailer depends on
 * Node's net/tls, which don't exist in the browser).
 *
 * Email is best-effort: a send failure is logged and swallowed, never
 * thrown — a broken SMTP config must never block checkout or cancellation.
 */

let cached: Transporter | null | undefined;

export function isEmailConfigured(): boolean {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_APP_PASSWORD);
}

function getTransport(): Transporter | null {
  if (cached !== undefined) return cached;
  if (!isEmailConfigured()) {
    console.warn("[email] SMTP_USER/SMTP_APP_PASSWORD not set — emails will be skipped.");
    cached = null;
    return cached;
  }
  cached = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_APP_PASSWORD },
  });
  return cached;
}

export async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<boolean> {
  const transport = getTransport();
  if (!transport) return false;
  const fromName = process.env.SMTP_FROM_NAME || "SAAJ";
  try {
    await transport.sendMail({
      from: `"${fromName}" <${process.env.SMTP_USER}>`,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    });
    return true;
  } catch (err) {
    console.error("[email] send failed:", err instanceof Error ? err.message : err);
    return false;
  }
}
