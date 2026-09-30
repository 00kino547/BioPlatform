import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Cookie } from "lucide-react";
import { Button } from "@/components/ui/button";
import { branding } from "@/config/branding";

type ConsentValue = "accept" | "essential" | "unknown";

interface ConsentPayload {
  consent: ConsentValue;
  dnt: boolean;
  effective: ConsentValue;
}

async function getConsent(): Promise<ConsentPayload> {
  try {
    const res = await fetch("/api/privacy/consent", { credentials: "same-origin" });
    const json = (await res.json()) as { success: boolean; data?: ConsentPayload };
    return {
      consent: json?.data?.consent ?? "unknown",
      dnt: json?.data?.dnt ?? false,
      effective: json?.data?.effective ?? "essential",
    };
  } catch {
    return { consent: "unknown", dnt: false, effective: "unknown" };
  }
}

async function recordDecision(decision: "accept" | "essential"): Promise<boolean> {
  try {
    const res = await fetch("/api/privacy/consent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ decision }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

const COUNTDOWN_SECONDS = 20;

export function CookieConsentBanner() {
  const [consent, setConsent] = useState<ConsentValue | null>(null);
  const [dnt, setDnt] = useState(false);
  const [forceOpen, setForceOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [essentialRemaining, setEssentialRemaining] = useState(COUNTDOWN_SECONDS);
  const [essentialReady, setEssentialReady] = useState(false);
  const countdownRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const clearCountdown = useCallback(() => {
    clearTimeout(countdownRef.current);
    countdownRef.current = undefined;
  }, []);

  const startCountdown = useCallback(() => {
    clearCountdown();
    setEssentialRemaining(COUNTDOWN_SECONDS);
    setEssentialReady(false);
    const end = Date.now() + COUNTDOWN_SECONDS * 1000;
    const tick = () => {
      const remaining = Math.ceil((end - Date.now()) / 1000);
      setEssentialRemaining(Math.max(0, remaining));
      if (remaining > 0) {
        countdownRef.current = setTimeout(tick, 250);
      } else {
        setEssentialReady(true);
        countdownRef.current = undefined;
      }
    };
    tick();
  }, [clearCountdown]);

  useEffect(() => {
    let alive = true;
    getConsent().then((data) => {
      if (!alive) return;
      setConsent(data.consent);
      setDnt(data.dnt);
      if (data.consent === "unknown" && !data.dnt) {
        startCountdown();
      } else {
        setEssentialReady(true);
      }
    });

    const onOpen = () => {
      setForceOpen(true);
      setDismissed(false);
    };
    window.addEventListener("bio:open-cookie-settings", onOpen);
    return () => {
      alive = false;
      clearCountdown();
      window.removeEventListener("bio:open-cookie-settings", onOpen);
    };
  }, [startCountdown, clearCountdown]);

  useEffect(() => {
    if (forceOpen && consent !== "unknown" && consent !== null) {
      setEssentialReady(true);
      clearCountdown();
    }
  }, [forceOpen, consent, clearCountdown]);

  if (dnt) return null;

  const showBanner = consent === "unknown" || forceOpen;
  if (consent === null || !showBanner || dismissed) return null;

  const decide = async (decision: "accept" | "essential") => {
    setDismissed(true);
    setForceOpen(false);
    clearCountdown();
    const ok = await recordDecision(decision);
    if (ok) {
      setConsent(decision);
      window.dispatchEvent(new CustomEvent("bio:consent-changed", { detail: { decision } }));
    }
  };

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className="fixed inset-x-0 bottom-0 z-50 p-4 sm:p-6"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-4 rounded-2xl border border-zinc-700 bg-zinc-900/95 p-5 shadow-2xl backdrop-blur-sm sm:flex-row sm:items-center">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-600/20 text-violet-400">
            <Cookie className="h-5 w-5" />
          </span>
          <div className="text-sm text-zinc-300">
            <p className="font-medium text-white">
              {consent === "unknown" ? "We value your privacy" : "Cookie preferences"}
            </p>
            <p className="mt-1">
              {branding.name} uses essential cookies (authentication, security) that are always active,
              and optional anonymous analytics cookies that only load when you accept.
            </p>
            <Link to="/privacy" className="mt-1 inline-block text-xs text-violet-400 hover:text-violet-300 transition-colors">
              Learn more in the Privacy Policy
            </Link>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:flex-col lg:flex-row">
          <Button size="sm" onClick={() => decide("accept")}>
            Accept all
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={!essentialReady}
            onClick={() => decide("essential")}
            className="min-w-[140px] text-center tabular-nums"
          >
            {essentialReady ? "Essential only" : `Essential only (${essentialRemaining}s)`}
          </Button>
          {consent !== "unknown" && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setForceOpen(false);
                setDismissed(true);
              }}
            >
              Close
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
