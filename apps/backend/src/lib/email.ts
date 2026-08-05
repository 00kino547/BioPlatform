import nodemailer from "nodemailer";
import { getEnv } from "../config/env.js";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

let _transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (_transporter) return _transporter;

  const env = getEnv();

  if (env.SMTP_PROVIDER === "gmail") {
    _transporter = nodemailer.createTransport({
      service: "gmail",
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
      tls: { rejectUnauthorized: true },
      connectionTimeout: 10000,
      greetingTimeout: 5000,
    });
  } else {
    _transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
      tls: { rejectUnauthorized: true },
      connectionTimeout: 10000,
      greetingTimeout: 5000,
    });
  }

  return _transporter;
}

export function isEmailEnabled(): boolean {
  return getEnv().SMTP_ENABLED && !!getEnv().SMTP_USER;
}

export function getFromAddress(): string {
  const env = getEnv();
  const from = env.SMTP_FROM_EMAIL || env.SMTP_USER;
  return `"${env.SMTP_FROM_NAME}" <${from}>`;
}

interface SendOptions {
  to: string;
  subject: string;
  html: string;
  listUnsubscribe?: string;
}

export async function sendEmail(options: SendOptions): Promise<{ success: boolean; error?: string }> {
  if (!isEmailEnabled()) {
    return { success: false, error: "Email is not configured" };
  }

  const env = getEnv();

  try {
    const transporter = getTransporter();
    const info = await transporter.sendMail({
      from: getFromAddress(),
      to: options.to,
      subject: options.subject,
      html: options.html,
      headers: {
        "X-Mailer": `${env.SMTP_FROM_NAME} Mailer`,
        "X-Priority": "3",
        "Precedence": "bulk",
        ...(options.listUnsubscribe
          ? { "List-Unsubscribe": `<${options.listUnsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
          : {}),
      },
      envelope: {
        from: env.SMTP_FROM_EMAIL || env.SMTP_USER,
        to: options.to,
      },
    });

    console.log(`Email sent: ${info.messageId}`);
    return { success: true };
  } catch (err) {
    console.error("Email send failed:", err);
    return { success: false, error: err instanceof Error ? err.message : "Failed to send email" };
  }
}

export async function testConnection(): Promise<{ success: boolean; error?: string }> {
  if (!isEmailEnabled()) {
    return { success: false, error: "Email is not configured" };
  }

  try {
    const transporter = getTransporter();
    await transporter.verify();
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Connection failed" };
  }
}

export function buildViewNotification(opts: {
  appName: string;
  profileUrl: string;
  viewerIp?: string;
}): string {
  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="margin:0;padding:0;background-color:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
      <div style="max-width:480px;margin:40px auto;background:#18181b;border-radius:12px;border:1px solid #27272a;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#7c3aed,#0ea5e9);padding:24px;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:18px;">${opts.appName}</h1>
        </div>
        <div style="padding:24px;">
          <h2 style="color:#e4e4e7;font-size:16px;margin:0 0 12px;">New Profile View</h2>
          <p style="color:#a1a1aa;font-size:14px;line-height:1.6;margin:0 0 20px;">
            Someone viewed your profile${opts.viewerIp ? ` from <code style="background:#27272a;padding:2px 6px;border-radius:4px;font-size:12px;">${escapeHtml(opts.viewerIp)}</code>` : ""}.
          </p>
          <a href="${opts.profileUrl}" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:14px;font-weight:500;">View Profile</a>
        </div>
        <div style="padding:16px 24px;border-top:1px solid #27272a;text-align:center;">
          <p style="color:#52525b;font-size:11px;margin:0;">You're receiving this because email notifications are enabled.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

export function buildUnlockEmail(opts: { appName: string; username: string; unlockUrl: string }): string {
  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="margin:0;padding:0;background-color:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
      <div style="max-width:480px;margin:40px auto;background:#18181b;border-radius:12px;border:1px solid #27272a;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#f43f5e,#7c3aed);padding:24px;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:18px;">${opts.appName}</h1>
        </div>
        <div style="padding:24px;">
          <h2 style="color:#e4e4e7;font-size:16px;margin:0 0 12px;">Account Locked</h2>
          <p style="color:#a1a1aa;font-size:14px;line-height:1.6;margin:0 0 20px;">
            Hi <strong style="color:#e4e4e7;">${escapeHtml(opts.username)}</strong>. We detected too many failed sign-in attempts and locked your account for security.
          </p>
          <p style="color:#a1a1aa;font-size:14px;line-height:1.6;margin:0 0 20px;">
            Click the button below to verify it's you and unlock your account. If you didn't try to sign in, you can safely ignore this email.
          </p>
          <a href="${opts.unlockUrl}" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:500;">Unlock My Account</a>
        </div>
        <div style="padding:16px 24px;border-top:1px solid #27272a;text-align:center;">
          <p style="color:#52525b;font-size:11px;margin:0;">You're receiving this because a sign-in attempt triggered an account lock.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

export function buildClickNotification(opts: {
  appName: string;
  platform: string;
  profileUrl: string;
}): string {
  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="margin:0;padding:0;background-color:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
      <div style="max-width:480px;margin:40px auto;background:#18181b;border-radius:12px;border:1px solid #27272a;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#22c55e,#0ea5e9);padding:24px;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:18px;">${opts.appName}</h1>
        </div>
        <div style="padding:24px;">
          <h2 style="color:#e4e4e7;font-size:16px;margin:0 0 12px;">New Link Click</h2>
          <p style="color:#a1a1aa;font-size:14px;line-height:1.6;margin:0 0 20px;">
            Someone clicked your <strong style="color:#e4e4e7;">${escapeHtml(opts.platform)}</strong> link.
          </p>
          <a href="${opts.profileUrl}" style="display:inline-block;background:#22c55e;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:14px;font-weight:500;">View Profile</a>
        </div>
        <div style="padding:16px 24px;border-top:1px solid #27272a;text-align:center;">
          <p style="color:#52525b;font-size:11px;margin:0;">You're receiving this because email notifications are enabled.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}
