import { useCallback, useEffect, useState } from "react";
import { api, type InvitePack, type InviteResaleMode } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ManualPaymentInstructionsEditor } from "@/components/settings/ManualPaymentInstructionsEditor";
import { BadgeCheck, Ban, Check, Link2, Loader2, RefreshCw, ShoppingBag, TriangleAlert } from "lucide-react";

// Admin controls for selling invite credits.
//
// Kept in its own file rather than inside AdminDashboard: the dashboard already
// renders every tab inline, and this card carries its own loading, save and
// confirmation state, which would otherwise have to be threaded through it.
//
// Resale is deliberately a separate control from purchasing. Turning the store on
// decides whether money can be taken; the resale mode decides whether the Terms
// prohibit passing a code on. They are different promises to users, so they are
// not behind one switch.

const RESALE_MODES: Array<{ value: InviteResaleMode; label: string; help: string }> = [
  {
    value: "off",
    label: "Not addressed",
    help: "The Terms say nothing about selling invite codes onwards.",
  },
  {
    value: "permitted",
    label: "Permitted in the Terms",
    help: "Publishes an explicit resale permission, so a member selling their codes is acting on the Terms. Nothing is blocked or tracked.",
  },
  {
    value: "legal",
    label: "Prohibited in the Terms",
    help: "An explicit resale prohibition is published. Codes are not tracked by origin.",
  },
  {
    value: "enforced",
    label: "Prohibited and tracked",
    help: "Publishes the prohibition and records where purchased codes came from, so the platform can answer that question.",
  },
];

type AdminPurchase = {
  id: string;
  userId: string | null;
  buyerEmail: string;
  quantity: number;
  priceCents: number;
  currency: string;
  method: "MANUAL" | "STRIPE" | "PAYPAL" | "CRYPTO";
  status: "PENDING" | "PAID" | "REFUNDED" | "CANCELLED";
  createdAt: string;
  paidAt: string | null;
  refundedAt: string | null;
  claimedById: string | null;
};

function money(cents: number, currency: string): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
}

function toggleClass(on: boolean): string {
  return `relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
    on ? "bg-violet-500" : "bg-zinc-700"
  }`;
}

function knobClass(on: boolean): string {
  return `inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
    on ? "translate-x-6" : "translate-x-1"
  }`;
}

export function AdminInvitePurchaseCard() {
  const [purchaseEnabled, setPurchaseEnabled] = useState(false);
  const [resaleMode, setResaleMode] = useState<InviteResaleMode>("off");
  const [packs, setPacks] = useState<InvitePack[]>([]);
  const [currency, setCurrency] = useState("USD");
  const [configured, setConfigured] = useState(false);
  const [emailConfigured, setEmailConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const [purchases, setPurchases] = useState<AdminPurchase[]>([]);
  const [busyOrder, setBusyOrder] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    try {
      const res = await api.getInvitePurchaseSettings();
      if (res.success && res.data) {
        setPurchaseEnabled(res.data.purchaseEnabled);
        setResaleMode(res.data.resaleMode);
        setPacks(res.data.packs);
        setCurrency(res.data.currency);
        setConfigured(res.data.configured);
        // Default to "mail works" until proven otherwise: a false alarm here would
        // train an operator to ignore the warning that follows.
        setEmailConfigured(res.data.emailConfigured ?? true);
      }
    } catch {
      setNotice({ tone: "err", text: "Could not load invite purchase settings." });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPurchases = useCallback(async () => {
    try {
      const res = await api.getAdminInvitePurchases();
      if (res.success && res.data) setPurchases(res.data.purchases);
    } catch {
      // The list is informational; a failure here must not block the settings.
    }
  }, []);

  useEffect(() => {
    void loadSettings();
    void loadPurchases();
  }, [loadSettings, loadPurchases]);

  const save = async (patch: { purchaseEnabled?: boolean; resaleMode?: InviteResaleMode }) => {
    setSaving(true);
    setNotice(null);
    const res = await api.updateInvitePurchaseSettings({
      purchaseEnabled: patch.purchaseEnabled ?? purchaseEnabled,
      resaleMode: patch.resaleMode ?? resaleMode,
    });
    setSaving(false);
    if (!res.success || !res.data) {
      setNotice({ tone: "err", text: res.error ?? "Could not save." });
      return;
    }
    setPurchaseEnabled(res.data.purchaseEnabled);
    setResaleMode(res.data.resaleMode);
    setNotice({ tone: "ok", text: "Saved." });
  };

  const act = async (orderId: string, action: "confirm" | "refund" | "cancel") => {
    setBusyOrder(orderId);
    setNotice(null);
    const res =
      action === "confirm"
        ? await api.confirmInvitePurchase(orderId)
        : action === "refund"
          ? await api.refundInvitePurchase(orderId)
          : await api.cancelInvitePurchase(orderId);
    setBusyOrder(null);
    if (!res.success) {
      setNotice({ tone: "err", text: res.error ?? "Could not update the purchase." });
      return;
    }
    setNotice({
      tone: "ok",
      text:
        action === "confirm"
          ? "Credits granted."
          : action === "refund"
            ? "Recorded as refunded. Unspent credits and codes from that purchase were revoked — remember to return the money at the payment provider."
            : "Purchase cancelled.",
    });
    void loadPurchases();
  };

  // Re-issues the buyer's claim link and puts it on the clipboard. This is the
  // fulfilment path that does not depend on the mailer working: the operator hands
  // the link over themselves, and the codes themselves stay behind the token.
  const copyClaimLink = async (orderId: string) => {
    setBusyOrder(orderId);
    setNotice(null);
    const res = await api.getAdminInviteClaimLink(orderId);
    setBusyOrder(null);
    if (!res.success || !res.data) {
      setNotice({ tone: "err", text: res.error ?? "Could not create a claim link." });
      return;
    }
    try {
      await navigator.clipboard.writeText(res.data.url);
      setNotice({
        tone: "ok",
        text: res.data.emailed
          ? "Claim link copied. They were already emailed one — this is a fresh link for the same codes, valid "
            + res.data.expiresInDays + " days."
          : "Claim link copied. Send it to the buyer yourself — they were never emailed one.",
      });
    } catch {
      // Clipboard access is refused in plenty of contexts (insecure origin, no
      // permission). Showing the link is better than pretending it was copied.
      setNotice({ tone: "err", text: "Copy this link manually: " + res.data.url });
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-7 sm:p-8 mb-8">
        <p className="text-sm text-zinc-500">Loading paid invite settings…</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-7 sm:p-8 mb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white mb-1 flex items-center gap-2">
            <ShoppingBag className="h-5 w-5 text-violet-400" aria-hidden />
            Paid invite credits
          </h2>
          <p className="text-sm text-zinc-500">
            Let people buy invite credits. Purchased credits land on the buyer's balance and never
            expire; a guest who buys before registering gets codes by email instead.
          </p>
        </div>
        <button
          type="button"
          aria-label="Toggle paid invite credits"
          aria-pressed={purchaseEnabled}
          disabled={saving}
          onClick={() => save({ purchaseEnabled: !purchaseEnabled })}
          className={toggleClass(purchaseEnabled)}
        >
          <span className={knobClass(purchaseEnabled)} />
        </button>
      </div>

      {!configured && (
        <p className="mt-4 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            No packs are priced, so nothing can be sold yet. Set{" "}
            <code className="font-mono">INVITE_PRICE_PACKS</code> (for example{" "}
            <code className="font-mono">1:100,3:200,10:600</code>) and restart the backend. An
            empty pack list keeps the store closed whatever this switch says.
          </span>
        </p>
      )}

      {/* Loud, because the failure this prevents is silent and expensive: a guest
          buys, the operator confirms, and the codes exist only inside an email
          that never arrives. A real mailbox with a SPF/DKIM record (a Gmail
          address with an app password is plenty to start) is what turns the guest
          flow from "operator hand-delivers every order" into "it just works". */}
      {purchaseEnabled && !emailConfigured && (
        <div
          role="alert"
          className="mt-4 rounded-xl border-2 border-red-500/50 bg-red-500/10 px-5 py-4 text-sm text-red-200"
        >
          <p className="flex items-center gap-2 text-base font-semibold text-red-300">
            <TriangleAlert className="h-5 w-5 shrink-0" aria-hidden />
            Mail is not configured — guest buyers cannot be delivered
          </p>
          <p className="mt-2">
            The store is <strong>on</strong>, so you are taking money right now, but this instance
            has no working outbound mail. A guest who buys before registering receives their invite
            codes <em>by email only</em>, and that email cannot be sent: confirm one of their orders
            and they will have paid for something they cannot reach.
          </p>
          <p className="mt-2">
            Configure a real mailbox before you take another order — a Gmail address with an app
            password is the quickest route. Set <code className="font-mono">SMTP_HOST</code>,{" "}
            <code className="font-mono">SMTP_PORT</code>, <code className="font-mono">SMTP_USER</code>,{" "}
            <code className="font-mono">SMTP_PASS</code>, <code className="font-mono">SMTP_FROM_EMAIL</code>{" "}
            and <code className="font-mono">SMTP_ENABLED=true</code>, then recreate the backend.
          </p>
          <p className="mt-2 text-red-300/90">
            Until then you can still fulfil by hand: use <strong>Copy claim link</strong> on any paid
            guest order below and send the buyer that link over whatever channel you already have
            with them. That link is the only thing you need — it does not reveal the codes
            themselves.
          </p>
        </div>
      )}

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {packs.length === 0 ? (
          <p className="text-sm text-zinc-500">No packs configured.</p>
        ) : (
          packs.map((pack) => (
            <div
              key={pack.quantity}
              className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3"
            >
              <p className="text-sm font-medium text-white">
                {pack.quantity} credit{pack.quantity === 1 ? "" : "s"}
              </p>
              <p className="text-sm text-zinc-400">
                {money(pack.priceCents, currency)}
                <span className="text-zinc-600"> · {money(pack.unitCents, currency)} each</span>
              </p>
              {pack.bestValue && (
                <p className="mt-1 text-xs font-medium text-emerald-400">Best value</p>
              )}
            </div>
          ))
        )}
      </div>

      <div className="mt-6 border-t border-zinc-800/70 pt-5">
        <h3 className="text-sm font-semibold text-white mb-1">Resale</h3>
        <p className="text-sm text-zinc-500 mb-3">
          Whether the Terms let a member sell an invite code onwards. This is a published legal
          position, so it is not tied to the store switch above.
        </p>
        <div className="grid gap-2">
          {RESALE_MODES.map((mode) => (
            <label
              key={mode.value}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors ${
                resaleMode === mode.value
                  ? "border-violet-500/60 bg-violet-500/10"
                  : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-700"
              }`}
            >
              <input
                type="radio"
                name="invite-resale-mode"
                className="mt-1 accent-violet-500"
                checked={resaleMode === mode.value}
                disabled={saving}
                onChange={() => save({ resaleMode: mode.value })}
              />
              <span>
                <span className="block text-sm font-medium text-white">{mode.label}</span>
                <span className="block text-xs text-zinc-500">{mode.help}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {/*
        The store offers "pay by hand", so the operator has to be able to say where
        to send the money without leaving this card. Shared with the Orders tab:
        one setting for both checkouts.
      */}
      <div className="mt-6 border-t border-zinc-800/70 pt-5">
        <ManualPaymentInstructionsEditor />
      </div>

      {notice && (
        <p
          role="status"
          className={`mt-4 rounded-lg px-4 py-3 text-sm ${
            notice.tone === "ok"
              ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
              : "bg-red-500/10 border border-red-500/20 text-red-400"
          }`}
        >
          {notice.text}
        </p>
      )}

      <div className="mt-6 border-t border-zinc-800/70 pt-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Recent purchases</h3>
          <button
            type="button"
            onClick={() => void loadPurchases()}
            className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            Refresh
          </button>
        </div>

        {purchases.length === 0 ? (
          <p className="text-sm text-zinc-500">No invite credits have been bought yet.</p>
        ) : (
          <ul className="space-y-2">
            {purchases.map((purchase) => (
              <li
                key={purchase.id}
                className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm text-white">
                    <span className="truncate">{purchase.buyerEmail}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        purchase.status === "PAID"
                          ? "bg-emerald-500/15 text-emerald-400"
                          : purchase.status === "PENDING"
                            ? "bg-amber-500/15 text-amber-400"
                            : "bg-zinc-700/40 text-zinc-400"
                      }`}
                    >
                      {purchase.status.toLowerCase()}
                    </span>
                    <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                      {purchase.method.toLowerCase()}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {purchase.quantity} credit{purchase.quantity === 1 ? "" : "s"} ·{" "}
                    {money(purchase.priceCents, purchase.currency)} ·{" "}
                    {new Date(purchase.createdAt).toLocaleString()}
                    {purchase.userId === null && purchase.status === "PAID"
                      ? " · guest codes by email"
                      : ""}
                    {purchase.claimedById ? " · adopted by an account" : ""}
                  </p>
                </div>

                <div className="flex shrink-0 gap-2">
                  {purchase.method === "MANUAL" && purchase.status === "PENDING" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyOrder === purchase.id}
                      onClick={() => act(purchase.id, "confirm")}
                    >
                      {busyOrder === purchase.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        <Check className="h-4 w-4" aria-hidden />
                      )}
                      Confirm
                    </Button>
                  )}
                  {purchase.status === "PAID" && purchase.userId === null && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyOrder === purchase.id}
                      onClick={() => void copyClaimLink(purchase.id)}
                      title="Re-issues this buyer's claim link so you can deliver it yourself. Does not reveal the codes."
                    >
                      {busyOrder === purchase.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        <Link2 className="h-4 w-4" aria-hidden />
                      )}
                      Copy claim link
                    </Button>
                  )}
                  {purchase.status === "PAID" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyOrder === purchase.id}
                      onClick={() => {
                        // The platform does not call the payment provider, so the
                        // operator must return the money first. Saying "refund"
                        // on its own would read as though charging had been undone,
                        // and an admin would reasonably click it expecting that.
                        const paid = window.confirm(
                          "Return the money at " +
                            (purchase.method === "MANUAL" ? "the payment provider" : purchase.method) +
                            " first.\n\nThis only records the refund here and revokes the unspent credits " +
                            "and codes from this purchase. Anything already redeemed stays valid.\n\nContinue?"
                        );
                        if (paid) void act(purchase.id, "refund");
                      }}
                      title="Records the refund and revokes unspent credits. Does not refund at the payment provider."
                    >
                      <Ban className="h-4 w-4" aria-hidden />
                      Mark refunded
                    </Button>
                  )}
                  {purchase.status === "PENDING" && purchase.method !== "MANUAL" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busyOrder === purchase.id}
                      onClick={() => act(purchase.id, "cancel")}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="mt-4 flex items-start gap-2 text-xs text-zinc-500">
        <BadgeCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          Refunding revokes the unspent codes and credits from that purchase. Codes someone has
          already redeemed stay valid — that person has joined.
        </span>
      </p>
    </div>
  );
}