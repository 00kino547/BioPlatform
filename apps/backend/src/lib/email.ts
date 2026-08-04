import nodemailer from "nodemailer";

export interface EmailSettings {
  enabled: boolean;
  provider: "gmail" | "custom";
  gmailUser?: string;
  gmailAppPassword?: string;
  customHost?: string;
  customPort?: number;
  customUser?: string;
  customPassword?: string;
  customSecure?: boolean;
}

function createTransporter(settings: EmailSettings) {
  if (settings.provider === "gmail") {
    return nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: settings.gmailUser,
        pass: settings.gmailAppPassword,
      },
    });
  }

  return nodemailer.createTransport({
    host: settings.customHost,
    port: settings.customPort ?? 587,
    secure: settings.customSecure ?? false,
    auth: {
      user: settings.customUser,
      pass: settings.customPassword,
    },
  });
}

export async function sendEmail(
  settings: EmailSettings,
  options: { to: string; subject: string; html: string }
): Promise<{ success: boolean; error?: string }> {
  if (!settings.enabled) {
    return { success: false, error: "Email notifications are disabled" };
  }

  try {
    const transporter = createTransporter(settings);
    await transporter.sendMail({
      from: settings.provider === "gmail" ? settings.gmailUser : settings.customUser,
      to: options.to,
      subject: options.subject,
      html: options.html,
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to send email" };
  }
}

export async function testEmailConnection(
  settings: EmailSettings
): Promise<{ success: boolean; error?: string }> {
  try {
    const transporter = createTransporter(settings);
    await transporter.verify();
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Connection failed" };
  }
}
