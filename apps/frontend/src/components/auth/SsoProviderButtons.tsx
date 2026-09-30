import { useCallback, useEffect, useRef, useState } from "react";
import { Building2, ChevronDown } from "lucide-react";
import { api, type EnterpriseSsoPublicConfig, type OAuthConfig, type OAuthProvider } from "@/lib/api";
import { Button } from "@/components/ui/button";

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="currentColor" aria-hidden="true">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62Z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53Z" />
    </svg>
  );
}

function DiscordIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4.5 w-4.5 text-[#5865F2]" fill="currentColor" aria-hidden="true">
      <path d="M20.32 4.37a19.79 19.79 0 0 0-4.89-1.52.07.07 0 0 0-.08.04c-.21.38-.44.87-.6 1.25a18.27 18.27 0 0 0-5.5 0 12.64 12.64 0 0 0-.61-1.25.08.08 0 0 0-.08-.04 19.74 19.74 0 0 0-4.88 1.52.07.07 0 0 0-.04.03C.53 9.05-.32 13.58.1 18.06a.08.08 0 0 0 .03.05 19.9 19.9 0 0 0 6 3.03.08.08 0 0 0 .08-.02c.46-.63.87-1.3 1.22-2 .04-.08.02-.16-.05-.22a13.11 13.11 0 0 1-1.87-.9.08.08 0 0 1-.01-.12c.13-.1.25-.19.37-.29a.07.07 0 0 1 .08-.01 14.3 14.3 0 0 0 12.16 0 .07.07 0 0 1 .08.01c.12.1.25.2.37.3a.08.08 0 0 1-.01.12c-.6.35-1.22.65-1.88.9-.06.05-.07.13-.04.21.36.7.77 1.37 1.23 2a.08.08 0 0 0 .08.02 19.84 19.84 0 0 0 6.01-3.03.08.08 0 0 0 .03-.05c.48-5.16-.8-9.66-3.39-13.66a.06.06 0 0 0-.03-.03ZM8.02 15.33c-1.18 0-2.16-1.08-2.16-2.42 0-1.33.96-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.96 2.42-2.16 2.42Zm7.96 0c-1.18 0-2.16-1.08-2.16-2.42 0-1.33.96-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.95 2.42-2.16 2.42Z" />
    </svg>
  );
}

const PROVIDER_LABEL: Record<OAuthProvider, string> = {
  google: "Google",
  github: "GitHub",
  discord: "Discord",
  pocketbase: "PocketBase",
};

interface SsoProviderButtonsProps {
  mode?: "login" | "signup";
  invite?: string;
  className?: string;
  dividerLabel?: string;
}

export function SsoProviderButtons({ mode = "login", invite, className, dividerLabel }: SsoProviderButtonsProps) {
  const [config, setConfig] = useState<OAuthConfig | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<OAuthProvider | null>(null);

  useEffect(() => {
    api.ssoConfig().then((res) => {
      if (res.success && res.data) setConfig(res.data);
    });
  }, []);

  const handleClick = useCallback(
    async (provider: OAuthProvider) => {
      setError("");
      setBusy(provider);
      try {
        const res = await api.ssoStart(provider, mode, invite);
        if (!res.success || !res.data?.redirectUrl) {
          setError(res.error ?? "Could not start sign-in");
          return;
        }
        window.location.href = res.data.redirectUrl;
      } catch {
        setError("Could not start sign-in");
      } finally {
        setBusy(null);
      }
    },
    [mode, invite]
  );

  if (!config || config.providers.length === 0) return null;

  const ProviderIcon = (provider: OAuthProvider) =>
    provider === "google" ? <GoogleIcon /> : provider === "discord" ? <DiscordIcon /> : <GitHubIcon />;

  return (
    <div className={className}>
      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}
      <div className="space-y-3">
        {config.providers.map((provider) => (
          <Button
            key={provider}
            type="button"
            variant="secondary"
            className="w-full h-11"
            onClick={() => handleClick(provider)}
            disabled={busy !== null}
          >
            {ProviderIcon(provider)}
            {busy === provider ? "Redirecting..." : `Continue with ${PROVIDER_LABEL[provider]}`}
          </Button>
        ))}
      </div>
      {dividerLabel && (
        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-zinc-800" />
          <span className="text-xs text-zinc-500">{dividerLabel}</span>
          <span className="h-px flex-1 bg-zinc-800" />
        </div>
      )}
    </div>
  );
}

interface EnterpriseSsoButtonsProps {
  mode?: "login" | "signup";
  className?: string;
}

function ProviderMark({ provider }: { provider: EnterpriseSsoPublicConfig }) {
  return provider.logoUrl ? (
    <img
      src={provider.logoUrl}
      alt=""
      className="h-5 w-5 rounded object-contain"
      referrerPolicy="no-referrer"
    />
  ) : (
    <Building2 className="h-4.5 w-4.5 text-zinc-300" />
  );
}

export function EnterpriseSsoButtons({ className }: EnterpriseSsoButtonsProps) {
  const [providers, setProviders] = useState<EnterpriseSsoPublicConfig[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.ssoEnterpriseConfigs().then((res) => {
      if (res.success && res.data) setProviders(res.data);
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handleClick = useCallback(async (configId: string) => {
    setError("");
    setBusy(configId);
    try {
      const res = await api.ssoEnterpriseStart(configId, "login");
      if (!res.success || !res.data?.redirectUrl) {
        setError(res.error ?? "Could not start sign-in");
        return;
      }
      window.location.href = res.data.redirectUrl;
    } catch {
      setError("Could not start sign-in");
    } finally {
      setBusy(null);
    }
  }, []);

  if (providers.length === 0) return null;

  const errorBox = error ? (
    <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
      {error}
    </div>
  ) : null;

  if (providers.length === 1) {
    const provider = providers[0];
    return (
      <div className={className}>
        {errorBox}
        <div className="space-y-3">
          <Button
            type="button"
            variant="secondary"
            className="w-full h-11"
            onClick={() => handleClick(provider.id)}
            disabled={busy !== null}
          >
            <ProviderMark provider={provider} />
            {busy === provider.id ? "Redirecting..." : `Continue with ${provider.displayName}`}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      {errorBox}
      <div className="relative" ref={menuRef}>
        <Button
          type="button"
          variant="secondary"
          className="w-full h-11"
          onClick={() => setOpen((o) => !o)}
          disabled={busy !== null}
          aria-expanded={open}
        >
          <Building2 className="h-4.5 w-4.5 text-zinc-300" />
          Business SSO
          <ChevronDown className={`h-4 w-4 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </Button>
        {open && (
          <div
            role="menu"
            aria-label="Sign in with your organization"
            className="absolute left-0 right-0 z-20 mt-2 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl"
          >
            <div className="border-b border-zinc-800/60 px-4 py-2 text-xs text-zinc-500">
              Sign in with your organization
            </div>
            {providers.map((provider) => (
              <button
                key={provider.id}
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-800/60"
                onClick={() => {
                  setOpen(false);
                  handleClick(provider.id);
                }}
              >
                <ProviderMark provider={provider} />
                <span className="flex min-w-0 flex-col">
                  <span className="text-sm font-medium">{provider.displayName}</span>
                  {provider.issuerHost ? (
                    <span className="truncate text-xs text-zinc-500">{provider.issuerHost}</span>
                  ) : null}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}