// Applies the instance's i18n configuration to the runtime once /api/config
// resolves.
//
// i18n is initialised synchronously at boot (main.tsx) with a best-guess locale
// so the first paint is never blocked. This gate then re-targets the instance
// with the authoritative `public.i18n` block: it turns multi-language on/off and
// pins the default locale when disabled. It renders its children immediately, so
// there is no loading screen while the config fetch is in flight.
import { useEffect } from "react";
import { useInstanceConfig } from "@/lib/useInstanceConfig";
import { initI18n } from "@/i18n";

export function I18nConfigGate({ children }: { children: React.ReactNode }) {
  const config = useInstanceConfig();

  useEffect(() => {
    if (config?.i18n) {
      initI18n(config.i18n);
    }
  }, [config]);

  return <>{children}</>;
}
