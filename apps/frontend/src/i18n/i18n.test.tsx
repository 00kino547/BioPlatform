// i18n lifecycle regression tests.
//
// Covers the runtime locale flow end-to-end at the unit level (the repo has no
// headless-browser runner): locale resolution order, the config gate, manual
// switching + persistence, document reflection, fallback for missing keys,
// interpolation, pluralization, catalog parity (getMissingKeys), and the
// LanguageSwitcher render path. Also pins the translation keys introduced for
// the previously hardcoded auth/error-boundary fallbacks so a future catalog
// cleanup cannot silently unship them.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import i18n from "i18next";
import { useInstanceConfig } from "@/lib/useInstanceConfig";
import {
  initI18n,
  resolveLocale,
  readStoredLocale,
  writeStoredLocale,
  clearStoredLocale,
  isNoticeDismissed,
  dismissNotice,
  NOTICE_DISMISSED_PREFIX,
  applyDocumentLanguage,
  getMissingKeys,
  LOCALE_STORAGE_KEY,
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
} from "@/i18n";
import { LanguageSwitcher } from "@/i18n/LanguageSwitcher";

// The switcher reads the instance config through this hook; the default test
// config is "enabled with en+es" and individual tests override it.
vi.mock("@/lib/useInstanceConfig", () => ({ useInstanceConfig: vi.fn() }));

function setI18nConfig(enabled: boolean, locales: string[] = ["en", "es"]) {
  vi.mocked(useInstanceConfig).mockReturnValue({
    i18n: { enabled, defaultLocale: "en", fallbackLocale: "en", locales },
  } as ReturnType<typeof useInstanceConfig>);
}

describe("resolveLocale", () => {
  it("prefers the stored preference when the locale is available", () => {
    expect(resolveLocale(["en", "es"], "es", "en")).toBe("es");
  });

  it("normalises region tags to the bundled base language", () => {
    expect(resolveLocale(["en", "es"], "es-MX", "en")).toBe("es");
    expect(resolveLocale(["en", "es"], "EN", "en")).toBe("en");
  });

  it("ignores a stored locale with no bundle and falls back", () => {
    expect(resolveLocale(["en", "es"], "fr", "en")).toBe("en");
  });

  it("walks Accept-Language order via navigator.languages", () => {
    const descriptor = Object.getOwnPropertyDescriptor(navigator, "languages");
    Object.defineProperty(navigator, "languages", { value: ["fr-FR", "es", "en"], configurable: true });
    expect(resolveLocale(["en", "es"], null, "en")).toBe("es");
    if (descriptor) Object.defineProperty(navigator, "languages", descriptor);
    else Object.defineProperty(navigator, "languages", { value: undefined, configurable: true });
  });

  it("uses the supplied fallback when nothing matches", () => {
    expect(resolveLocale(["en", "es"], null, "en")).toBe(DEFAULT_LOCALE);
  });

  it("never selects a locale outside the available set", () => {
    for (const tag of ["de", "fr", "zh-CN", "", null]) {
      const picked = resolveLocale(["en"], String(tag ?? ""), "en");
      expect(["en"]).toContain(picked);
    }
  });

  it("defends against an empty available list", () => {
    expect(resolveLocale([], "es", "en")).toBe("es");
    expect(resolveLocale([], null, "en")).toBe(DEFAULT_LOCALE);
    expect(SUPPORTED_LOCALES).toContain("en");
  });
});

describe("locale persistence helpers", () => {
  beforeEach(() => clearStoredLocale());
  afterEach(() => clearStoredLocale());

  it("round-trips an explicit choice", () => {
    expect(readStoredLocale()).toBeNull();
    writeStoredLocale("es");
    expect(readStoredLocale()).toBe("es");
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("es");
    clearStoredLocale();
    expect(readStoredLocale()).toBeNull();
  });

  it("remembers and clears the untranslated-notice dismissal per locale", () => {
    expect(isNoticeDismissed("es")).toBe(false);
    dismissNotice("es");
    expect(isNoticeDismissed("es")).toBe(true);
    expect(localStorage.getItem(NOTICE_DISMISSED_PREFIX + "es")).toBe("1");
    expect(isNoticeDismissed("en")).toBe(false);
  });
});

describe("initI18n gating (config.yml public.i18n)", () => {
  beforeEach(() => {
    clearStoredLocale();
    initI18n(); // boot defaults: disabled → pinned to the default locale
  });
  afterEach(() => {
    clearStoredLocale();
    initI18n();
  });

  it("pins the default locale while i18n is disabled, even with a stored choice", () => {
    writeStoredLocale("es");
    initI18n({ enabled: false, defaultLocale: "en", fallbackLocale: "en", locales: ["en", "es"] });
    expect(i18n.language).toBe("en");
  });

  it("honours the stored preference once enabled", () => {
    writeStoredLocale("es");
    initI18n({ enabled: true, defaultLocale: "en", fallbackLocale: "en", locales: ["en", "es"] });
    expect(i18n.language).toBe("es");
  });

  it("re-targets the instance when the config lands after boot", () => {
    initI18n({ enabled: false, defaultLocale: "en", fallbackLocale: "en", locales: ["en", "es"] });
    expect(i18n.language).toBe("en");
    writeStoredLocale("es");
    initI18n({ enabled: true, defaultLocale: "en", fallbackLocale: "en", locales: ["en", "es"] });
    expect(i18n.language).toBe("es");
  });

  it("falls back to the instance default when the stored locale was dropped", () => {
    writeStoredLocale("de");
    initI18n({ enabled: true, defaultLocale: "en", fallbackLocale: "en", locales: ["en", "es"] });
    expect(i18n.language).toBe("en");
  });
});

describe("document language reflection", () => {
  afterEach(() => applyDocumentLanguage("en"));

  it("sets lang and ltr for Spanish", () => {
    applyDocumentLanguage("es");
    expect(document.documentElement.lang).toBe("es");
    expect(document.documentElement.dir).toBe("ltr");
  });

  it("flips dir for RTL languages", () => {
    applyDocumentLanguage("ar");
    expect(document.documentElement.lang).toBe("ar");
    expect(document.documentElement.dir).toBe("rtl");
    expect(document.documentElement.dir).not.toBe("ltr");
  });
});

describe("translation behaviors", () => {
  beforeEach(() => {
    clearStoredLocale();
    initI18n();
  });

  it("interpolates named variables", () => {
    const out = i18n.t("auth:login.metaDescription", { name: "Demo" });
    expect(out).toContain("Demo");
    expect(out).not.toContain("{{name}}");
  });

  it("selects singular and plural forms (i18next v4 suffixes)", () => {
    expect(i18n.t("dashboard:affiliate.credits", { count: 1 })).toBe("+1 invite credit");
    expect(i18n.t("dashboard:affiliate.credits", { count: 5 })).toBe("+5 invite credits");
  });

  it("returns the key (never null) for a missing key", () => {
    const out = i18n.t("common:__definitely.missing.key");
    expect(typeof out).toBe("string");
    expect(out).toContain("__definitely.missing.key");
    expect(out).not.toBeNull();
  });

  it("keeps Spanish bundle complete vs English (getMissingKeys parity)", () => {
    // Run BEFORE the synthetic-fallback test below, which adds an English-only
    // probe key to the live bundle.
    expect(getMissingKeys("es")).toEqual([]);
  });

  it("falls back to English for a locale that lacks the key", () => {
    // Synthetic key present ONLY in English: any other language must resolve
    // through fallbackLng instead of rendering the raw key. Declared AFTER the
    // parity tests above so the synthetic key cannot pollute their view of the
    // English bundle.
    i18n.addResource("en", "common", "__fallbackProbe", "English fallback value");
    const out = i18n.t("common:__fallbackProbe", { lng: "de" });
    expect(out).toBe("English fallback value");
  });

  it("switches the active language and serves the Spanish catalog", async () => {
    await i18n.changeLanguage("es");
    expect(i18n.t("common:language.label")).toBe("Idioma");
    await i18n.changeLanguage("en");
    expect(i18n.t("common:language.label")).toBe("Language");
  });

  it("reports every English key when probing a language with no bundle", () => {
    const missing = getMissingKeys("zz");
    expect(missing.length).toBeGreaterThan(2000); // full catalog diff
    expect(missing.every((k) => k.includes(":"))).toBe(true);
  });
});

describe("repaired hardcoded-fallback keys (catalog contract)", () => {
  it("auth fallbacks exist and carry the original English wording", () => {
    expect(i18n.t("auth:login.accountLocked")).toBe("Account locked");
    expect(i18n.t("auth:login.loginFailed")).toBe("Login failed");
    expect(i18n.t("auth:login.couldNotStartPasskey")).toBe("Could not start passkey login");
    expect(i18n.t("auth:login.passkeyLoginCancelled")).toBe("Passkey login cancelled");
    expect(i18n.t("auth:login.passkeyLoginFailed")).toBe("Passkey login failed");
    expect(i18n.t("auth:login.passkeyAuthFailed")).toBe("Passkey authentication failed");
    expect(i18n.t("auth:login.verificationFailed")).toBe("Verification failed");
    expect(i18n.t("auth:login.couldNotStartPasskeyVerify")).toBe("Could not start passkey verification");
    expect(i18n.t("auth:login.passkeyVerifyCancelled")).toBe("Passkey verification cancelled");
    expect(i18n.t("auth:login.passkeyVerifyFailed")).toBe("Passkey verification failed");
    expect(i18n.t("auth:register.registrationFailed")).toBe("Registration failed");
  });

  it("error-boundary and webhook fallbacks resolve through their namespaces", () => {
    expect(i18n.t("common:errorBoundary.unexpected")).toBe("Unexpected error");
    expect(i18n.t("dashboard:webhooks.toasts.updateFailed")).toBe("Could not update webhook");
  });
});

describe("LanguageSwitcher", () => {
  beforeEach(() => setI18nConfig(true));
  afterEach(() => {
    clearStoredLocale();
    initI18n();
    vi.clearAllMocks();
  });

  it("renders both locales, persists the choice, and labels itself", async () => {
    clearStoredLocale();
    initI18n({ enabled: true, defaultLocale: "en", fallbackLocale: "en", locales: ["en", "es"] });
    const { container } = render(<LanguageSwitcher />);

    const select = container.querySelector("select");
    expect(select).not.toBeNull();
    expect([...select!.options].map((o) => o.value)).toEqual(["en", "es"]);
    // aria-label comes from the translated common:language.label key.
    expect(screen.getByLabelText("Language")).toBe(select);

    fireEvent.change(select!, { target: { value: "es" } });
    expect(readStoredLocale()).toBe("es");
    expect(document.documentElement.lang).toBe("es");
    expect(i18n.language).toBe("es");
  });

  it("stays hidden while the instance has i18n disabled or a single locale", () => {
    setI18nConfig(false, ["en"]);
    const { container } = render(<LanguageSwitcher />);
    expect(container.querySelector("select")).toBeNull();
  });
});
