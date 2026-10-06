import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { resolveTxt } from "node:dns/promises";
import nodemailer from "nodemailer";
import { getEnv } from "../config/env.js";

// Own-deliverer SMTP encryption (AES-256-GCM), key derived from JWT_SECRET
// with a distinct domain separator so sender credentials are never confused
// with any other secret stored by the platform.
function senderEncryptionKey(): Buffer {
  return createHash("sha256").update("bioplatform:newsletter:sender").update(getEnv().JWT_SECRET).digest();
}

export function encryptSenderSecret(value: string): string {
  const key = senderEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptSenderSecret(encoded: string): string {
  const key = senderEncryptionKey();
  const raw = Buffer.from(encoded, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const data = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export function generateVerificationToken(): string {
  return randomBytes(16).toString("hex");
}

// TXT record name: _bioplatform-verify.<domain> → value is the verification
// token. Ownership of the from-domain must be proven before self-deliverer
// sending is enabled (SPF/DKIM live on the domain, not on the platform).
export function verificationRecordName(fromEmail: string): string | null {
  const domain = fromEmail.split("@")[1]?.toLowerCase();
  if (!domain || !domain.includes(".")) return null;
  return `_bioplatform-verify.${domain}`;
}

export async function verifyDomainOwnership(fromEmail: string, token: string): Promise<boolean> {
  const name = verificationRecordName(fromEmail);
  if (!name) return false;
  try {
    const records = await resolveTxt(name);
    const values = records.map((parts) => parts.join("")).map((v) => v.trim());
    return values.includes(token);
  } catch {
    return false;
  }
}

export interface SenderSmtpOptions {
  fromName: string;
  fromEmail: string;
  host: string;
  port: number;
  secure: boolean;
  user: string | null;
  pass: string;
  to: string;
  subject: string;
  html: string;
  listUnsubscribe?: string;
}

export async function sendViaSenderSmtp(options: SenderSmtpOptions): Promise<{ success: boolean; error?: string }> {
  const transporter = nodemailer.createTransport({
    host: options.host,
    port: options.port,
    secure: options.secure,
    auth: { user: options.user ?? options.fromEmail, pass: options.pass },
    tls: { rejectUnauthorized: true },
    connectionTimeout: 15000,
    greetingTimeout: 8000,
  });
  try {
    const from = `"${options.fromName}" <${options.fromEmail}>`;
    const info = await transporter.sendMail({
      from,
      to: options.to,
      subject: options.subject,
      html: options.html,
      headers: {
        "X-Mailer": `${options.fromName} Mailer`,
        "X-Priority": "3",
        "Precedence": "bulk",
        ...(options.listUnsubscribe
          ? { "List-Unsubscribe": `<${options.listUnsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
          : {}),
      },
      envelope: {
        from: options.fromEmail,
        to: options.to,
      },
    });
    console.log(`Newsletter (own SMTP) sent for ${options.fromEmail}: ${info.messageId}`);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "SMTP send failed" };
  } finally {
    transporter.close();
  }
}

// SMTP deliverability probe: handshake and a single real test message, sent to
// the account's own email address. Only a fully successful send proves the
// deliverer works end to end, so testedAt is set exclusively on success.
export async function testSenderSmtp(options: {
  fromName: string;
  fromEmail: string;
  host: string;
  port: number;
  secure: boolean;
  user: string | null;
  pass: string;
  to: string;
}): Promise<{ success: boolean; error?: string }> {
  const transporter = nodemailer.createTransport({
    host: options.host,
    port: options.port,
    secure: options.secure,
    auth: { user: options.user ?? options.fromEmail, pass: options.pass },
    tls: { rejectUnauthorized: true },
    connectionTimeout: 15000,
    greetingTimeout: 8000,
  });
  try {
    await transporter.verify();
    const info = await transporter.sendMail({
      from: `"${options.fromName}" <${options.fromEmail}>`,
      to: options.to,
      subject: "Newsletter sender test — your own SMTP is ready",
      html:
        "<p style=\"font-family:system-ui;color:#333;\">This is a test message from your newsletter sender. " +
        "If you can read this, your own SMTP deliverer is working and you can start sending newsletters.</p>",
      envelope: { from: options.fromEmail, to: options.to },
    });
    console.log(`Newsletter sender test sent to ${options.to}: ${info.messageId}`);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "SMTP test failed" };
  } finally {
    transporter.close();
  }
}