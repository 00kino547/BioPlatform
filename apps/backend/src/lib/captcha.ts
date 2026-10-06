import { getEnv } from "../config/env.js";

export type CaptchaProvider = "none" | "turnstile" | "recaptcha" | "hcaptcha";

export interface CaptchaVerifyResult {
  success: boolean;
  error?: string;
}

interface VerifyEndpoint {
  url: string;
  contentType: "json" | "form";
}

function endpointFor(provider: CaptchaProvider): VerifyEndpoint | null {
  switch (provider) {
    case "turnstile":
      return { url: "https://challenges.cloudflare.com/turnstile/v0/siteverify", contentType: "json" };
    case "recaptcha":
      return { url: "https://www.google.com/recaptcha/api/siteverify", contentType: "form" };
    case "hcaptcha":
      return { url: "https://hcaptcha.com/siteverify", contentType: "form" };
    case "none":
      return null;
  }
}

export function captchaEnabled(): boolean {
  const env = getEnv();
  return env.CAPTCHA_PROVIDER !== "none" && Boolean(env.CAPTCHA_SITE_KEY) && Boolean(env.CAPTCHA_SECRET_KEY);
}

export function getCaptchaConfig(): { provider: CaptchaProvider; siteKey: string; enabled: boolean } {
  const env = getEnv();
  const enabled = captchaEnabled();
  return { provider: env.CAPTCHA_PROVIDER, siteKey: env.CAPTCHA_SITE_KEY, enabled };
}

export async function verifyCaptcha(token: string | undefined | null, remoteIp?: string): Promise<CaptchaVerifyResult> {
  const env = getEnv();
  const endpoint = endpointFor(env.CAPTCHA_PROVIDER);

  if (!captchaEnabled() || !endpoint) {
    return { success: true };
  }

  if (!token || typeof token !== "string" || token.length < 20 || token.length > 4096) {
    return { success: false, error: "Missing or invalid captcha response" };
  }

  const body =
    endpoint.contentType === "json"
      ? JSON.stringify({ secret: env.CAPTCHA_SECRET_KEY, response: token, remoteip: remoteIp })
      : new URLSearchParams({
          secret: env.CAPTCHA_SECRET_KEY,
          response: token,
          ...(remoteIp ? { remoteip: remoteIp } : {}),
        }).toString();

  try {
    const res = await fetch(endpoint.url, {
      method: "POST",
      headers: { "Content-Type": endpoint.contentType === "json" ? "application/json" : "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      return { success: false, error: "Captcha verification failed" };
    }
    const data = (await res.json()) as { success?: boolean; "error-codes"?: string[] };
    if (data.success === true) {
      return { success: true };
    }
    const codes = (data["error-codes"] ?? []).join(", ");
    return { success: false, error: codes ? `Captcha rejected: ${codes}` : "Captcha verification failed" };
  } catch {
    return { success: false, error: "Captcha verification unavailable" };
  }
}