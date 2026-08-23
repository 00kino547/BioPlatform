type RuntimeConfig = Record<string, string | undefined>;

declare global {
  interface Window {
    __APP_CONFIG__?: RuntimeConfig;
  }
}

export function getEnv(key: string): string | undefined {
  return window.__APP_CONFIG__?.[key] ?? (import.meta.env as RuntimeConfig)[key];
}
