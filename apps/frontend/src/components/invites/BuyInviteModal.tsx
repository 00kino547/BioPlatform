import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ShoppingBag, X } from "lucide-react";
import { InviteCreditStore } from "@/components/settings/InviteCreditStore";
import { usePolicyContext } from "@/lib/usePolicyContext";
import type { InvitePurchaseSummary } from "@/lib/api";

/**
 * "Buy an invite" popup for visitors who do not have a code yet.
 *
 * Registration is invite-only, so the register and login screens are where a
 * prospective member discovers they are blocked. Telling them only to ask an
 * existing member strands anyone who has nobody to ask, which is why the store is
 * reachable in place: the trigger opens the same storefront with the email they
 * already typed, and Escape or a backdrop click puts them back where they were.
 *
 * The trigger is not rendered at all when the store is closed, so no page ever
 * offers an offer the instance is not making. Pair it with a plain link to
 * `/invites` for the crawlable, no-JavaScript path.
 */
export function BuyInviteModal({
  /** Seeds the guest email field, typically the address already typed on the page. */
  email,
  /** Trigger label. */
  label = "Buy an invite",
  /** Called after a purchase so the host page can point at the order. */
  onPurchased,
  className = "",
}: {
  email?: string;
  label?: string;
  onPurchased?: (order: InvitePurchaseSummary) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const ctx = usePolicyContext();

  const storeOpen = ctx?.invites?.purchaseEnabled === true;

  const close = useCallback(() => {
    setOpen(false);
    // Send focus back where it came from so keyboard users are not dropped at the
    // top of the document.
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    // Everything the dialog owns: links, buttons, inputs, and any element that
    // opts into tab order. `aria-hidden` panels inside the storefront are
    // excluded so the trap never lands a Tab on invisible content.
    const focusables = () =>
      Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
        ) ?? []
      ).filter(
        (el) =>
          !el.hasAttribute("disabled") &&
          !el.getAttribute("aria-hidden") &&
          el.getAttribute("tabindex") !== "-1"
      );
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
        return;
      }
      // Keep Tab inside the dialog: a visitor cannot be dropped somewhere behind
      // the backdrop, and the overlay is the only focusable thing in the page
      // scope while it is open.
      if (event.key === "Tab") {
        const list = focusables();
        if (list.length === 0) return;
        const first = list[0];
        const last = list[list.length - 1];
        const active = document.activeElement;
        if (event.shiftKey && (active === first || active === panelRef.current)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    // Stop the page behind the popup from scrolling while it is open.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, close]);

  // Move focus into the dialog so the next Tab stays inside it.
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  if (!storeOpen) return null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:border-violet-500/60 hover:bg-zinc-800 hover:text-white ${className}`}
      >
        <ShoppingBag className="h-4 w-4" aria-hidden />
        {label}
      </button>

      {open
        ? createPortal(
            // Rendered through a portal to `document.body`: the design of some
            // hosts (the landing FAQ sits inside a ScrollReveal wrapper whose
            // `transform` would otherwise become the containing block of this
            // `position: fixed` overlay) would shrink the backdrop to a small
            // box that looks like an embedded frame and breaks click-outside.
            // The real overlay is always laid out against the viewport.
            <div
              className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm sm:p-6"
              // A click that starts and ends on the backdrop dismisses; a click
              // that began inside the panel must not close it while selecting
              // text.
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) close();
              }}
            >
              <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-label="Buy an invite"
                tabIndex={-1}
                className="my-4 w-full max-w-3xl rounded-2xl border border-zinc-700 bg-zinc-950/95 p-5 shadow-2xl outline-none sm:p-6"
              >
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-white">Get an invite</h2>
                    <p className="mt-1 text-sm text-zinc-400">
                      Buy an invite credit, then use one of the codes to register.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={close}
                    aria-label="Close"
                    className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white"
                  >
                    <X className="h-5 w-5" aria-hidden />
                  </button>
                </div>

                {email ? (
                  <p className="mb-4 text-xs text-zinc-500">
                    Delivering to <span className="text-zinc-300">{email}</span>. Change it below if that
                    is not the address you want the codes at.
                  </p>
                ) : null}

                <InviteCreditStore
                  showEmailField
                  initialEmail={email}
                  onPurchased={(order) => {
                    onPurchased?.(order);
                  }}
                />

                <p className="mt-4 text-center text-xs text-zinc-500">
                  Prefer to browse first?{" "}
                  <a href="/invites" className="text-violet-400 transition-colors hover:text-violet-300">
                    Open the full invite page
                  </a>
                  .
                </p>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
