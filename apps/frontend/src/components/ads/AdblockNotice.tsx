// Adblock notice shown on public profiles whose instance ads are rendering.
// A FREE-tier profile always mounts this (server forces the flag to true); a
// PRO/Enterprise profile only when the owner did not disable the detector
// (Profile.adblockDetectorEnabled !== false).
//
// The probe itself (`useAdblockDetector`) runs once on mount and is
// unmount-safe. The banner is only surfaced after a 10-second grace period so
// the visitor is not nagged before they scroll past the links — the same
// "dismissible after 10s" rhythm the consent banner uses. Dismissal is
// remembered for the rest of the session via sessionStorage so it does not
// re-appear on the next profile page they visit.

import { useEffect, useMemo, useState } from "react";
import { useAdblockDetector } from "@scthakuri/adblock-detector";
import { ShieldAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { branding } from "@/config/branding";

// Grace period before the notice (and its dismiss button) become visible.
const GRACE_MS = 10_000;
const SESSION_KEY = "bp_adblock_notice_hidden";

interface AdblockNoticeProps {
  /** Public profile accent color, used for the border/icon tint. */
  accent?: string;
  /** Public profile text color, used for the copy. */
  textColor?: string;
}

export function AdblockNotice({ accent = "#7c3aed", textColor = "#e4e4e7" }: AdblockNoticeProps) {
  const { detected, loading } = useAdblockDetector();
  const [elapsed, setElapsed] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Only surface the notice once the grace period has passed; hiding it any
  // earlier would defeat the "dismissible after 10s" flow entirely.
  useEffect(() => {
    const t = window.setTimeout(() => setElapsed(true), GRACE_MS);
    return () => window.clearTimeout(t);
  }, []);

  // Read the session flag once; the profile page does not change the notice
  // mid-view, so a memo is the right shape here. Guarded for non-browser
  // environments (the component never renders during SSR in this SPA, but the
  // public bundle can be pre-rendered).
  const sessionHidden = useMemo(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.sessionStorage.getItem(SESSION_KEY) === "1";
    } catch {
      return false;
    }
  }, []);

  if (loading || !detected || !elapsed || dismissed || sessionHidden) return null;

  const dismiss = () => {
    try {
      window.sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      // sessionStorage can throw in hardened/private contexts; hiding in memory
      // for the current view is still the right UX.
    }
    setDismissed(true);
  };

  return (
    <div
      role="note"
      aria-live="polite"
      className="mt-4 flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 backdrop-blur-sm"
      style={{ borderColor: `${accent}33`, backgroundColor: `${accent}12` }}
    >
      <ShieldAlert className="h-5 w-5 shrink-0" style={{ color: accent }} />
      <p className="flex-1 text-[13px] leading-relaxed" style={{ color: textColor }}>
        Your ad blocker is on — {branding.name} profiles stay free thanks to their ads. Consider whitelisting
        this page to keep supporting it.
      </p>
      <Button size="sm" variant="ghost" aria-label="Dismiss adblock notice" onClick={dismiss} className="shrink-0">
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}