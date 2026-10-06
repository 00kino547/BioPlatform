import { useEffect, useRef, useState } from "react";
import { api, type CaptchaConfig } from "@/lib/api";

type RenderableProvider = "turnstile" | "recaptcha" | "hcaptcha";
type CaptchaSize = "normal" | "compact";

interface WidgetHandle {
  reset?: () => void;
}

interface TurnstileGlobal {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string | undefined;
  reset?: (id?: string) => void;
}

interface GrecaptchaGlobal {
  ready: (cb: () => void) => void;
  render: (el: HTMLElement, opts: Record<string, unknown>) => number;
  reset?: (id?: number) => void;
}

interface HcaptchaGlobal {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string | undefined;
  reset?: (id?: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileGlobal;
    grecaptcha?: GrecaptchaGlobal;
    hcaptcha?: HcaptchaGlobal;
  }
}

const SCRIPT_URLS: Record<RenderableProvider, string> = {
  turnstile: "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
  recaptcha: "https://www.google.com/recaptcha/api.js?render=explicit",
  hcaptcha: "https://js.hcaptcha.com/1/api.js?render=explicit",
};

function ensureScript(provider: RenderableProvider): Promise<void> {
  const attr = `data-captcha-script="${provider}"`;
  const existing = document.querySelector<HTMLScriptElement>(`script[${attr}]`);
  if (existing) {
    if (existing.dataset.loaded === "true") return Promise.resolve();
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("captcha script failed")), { once: true });
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_URLS[provider];
    script.async = true;
    script.defer = true;
    script.dataset.captchaScript = provider;
    script.addEventListener(
      "load",
      () => {
        script.dataset.loaded = "true";
        resolve();
      },
      { once: true }
    );
    script.addEventListener("error", () => reject(new Error("captcha script failed")), { once: true });
    document.head.appendChild(script);
  });
}

export interface CaptchaWidgetProps {
  onToken: (token: string) => void;
  onEnabledChange?: (enabled: boolean) => void;
  resetKey?: string | number;
  size?: CaptchaSize;
  className?: string;
}

export function CaptchaWidget({ onToken, onEnabledChange, resetKey, size = "normal", className }: CaptchaWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<WidgetHandle>({});
  const onTokenRef = useRef(onToken);
  const [config, setConfig] = useState<CaptchaConfig | null>(null);

  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    let alive = true;
    api.getCaptchaConfig().then((res) => {
      if (!alive) return;
      const cfg = res.success && res.data ? res.data : null;
      setConfig(cfg);
      onEnabledChange?.(Boolean(cfg?.enabled));
    });
    return () => {
      alive = false;
    };
  }, [onEnabledChange]);

  useEffect(() => {
    if (!config?.enabled || config.provider === "none" || !config.siteKey) return;
    const provider = config.provider;
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let localHandle: WidgetHandle = {};

    const onSuccess = (token: string) => {
      if (!cancelled) onTokenRef.current(token);
    };
    const onExpire = () => {
      if (!cancelled) onTokenRef.current("");
    };

    const render = () => {
      if (cancelled || !container) return;
      container.innerHTML = "";
      const options: Record<string, unknown> = {
        sitekey: config.siteKey,
        callback: onSuccess,
        "expired-callback": onExpire,
        "error-callback": onExpire,
        theme: "dark",
        size,
      };

      if (provider === "turnstile" && window.turnstile) {
        const id = window.turnstile.render(container, options);
        localHandle = { reset: () => window.turnstile?.reset?.(id) };
      } else if (provider === "recaptcha" && window.grecaptcha) {
        const id = window.grecaptcha.render(container, options);
        localHandle = { reset: () => window.grecaptcha?.reset?.(id) };
      } else if (provider === "hcaptcha" && window.hcaptcha) {
        const id = window.hcaptcha.render(container, options);
        localHandle = { reset: () => window.hcaptcha?.reset?.(id) };
      }
      handleRef.current = localHandle;
    };

    if (provider === "recaptcha") {
      ensureScript(provider)
        .then(() => {
          if (cancelled) return;
          if (window.grecaptcha?.ready) {
            window.grecaptcha.ready(render);
          } else {
            render();
          }
        })
        .catch(() => onExpire());
    } else {
      ensureScript(provider)
        .then(render)
        .catch(() => onExpire());
    }

    return () => {
      cancelled = true;
      localHandle.reset?.();
    };
  }, [config, resetKey, size]);

  if (!config?.enabled) return null;

  return <div ref={containerRef} className={className ?? "flex justify-center"} />;
}