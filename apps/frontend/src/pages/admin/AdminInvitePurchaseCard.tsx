import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type InvitePack, type InviteResaleMode } from "@/lib/api";
import { formatCurrency, formatDateTime } from "@/lib/intl";
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
    label: "admin.invitePurchase.resaleModes.off",
    help: "admin.invitePurchase.resaleModes.offHelp",
  },
  {
    value: "permitted",
    label: "admin.invitePurchase.resaleModes.permitted",
    help: "admin.invitePurchase.resaleModes.permittedHelp",
  },
  {
    value: "legal",
    label: "admin.invitePurchase.resaleModes.legal",
    help: "admin.invitePurchase.resaleModes.legalHelp",
  },
  {
    value: "enforced",
    label: "admin.invitePurchase.resaleModes.enforced",
    help: "admin.invitePurchase.resaleModes.enforcedHelp",
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
  return formatCurrency(cents, currency);
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
  // Admin card for selling invite credits (settings + recent purchases).
  const { t } = useTranslation("admin");
  // Lowercase enum values map to translation keys, e.g. PAID -> statusPaid.
  const statusLabel = (s: string) => t(`admin.invitePurchase.status${s.charAt(0)}${s.slice(1).toLowerCase()}`);
  const methodLabel = (m: string) => t(`admin.invitePurchase.method${m.charAt(0)}${m.slice(1).toLowerCase()}`);
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
      setNotice({ tone: "err", text: t("admin.invitePurchase.loadFailed") });
    } finally {
      setLoading(false);
    }
  }, [t]);

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
      setNotice({ tone: "err", text: res.error ?? t("admin.invitePurchase.saveFailed") });
      return;
    }
    setPurchaseEnabled(res.data.purchaseEnabled);
    setResaleMode(res.data.resaleMode);
    setNotice({ tone: "ok", text: t("admin.invitePurchase.saved") });
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
      setNotice({ tone: "err", text: res.error ?? t("admin.invitePurchase.updateFailed") });
      return;
    }
    setNotice({
      tone: "ok",
      text:
        action === "confirm"
          ? t("admin.invitePurchase.creditsGranted")
          : action === "refund"
            ? t("admin.invitePurchase.recordedRefunded")
            : t("admin.invitePurchase.purchaseCancelled"),
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
      setNotice({ tone: "err", text: res.error ?? t("admin.invitePurchase.claimLinkFailed") });
      return;
    }
    try {
      await navigator.clipboard.writeText(res.data.url);
      setNotice({
        tone: "ok",
        text: res.data.emailed
          ? t("admin.invitePurchase.claimLinkCopiedEmailed", { days: res.data.expiresInDays })
          : t("admin.invitePurchase.claimLinkCopied"),
      });
    } catch {
      // Clipboard access is refused in plenty of contexts (insecure origin, no
      // permission). Showing the link is better than pretending it was copied.
      setNotice({ tone: "err", text: t("admin.invitePurchase.copyManually", { url: res.data.url }) });
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-7 sm:p-8 mb-8">
        <p className="text-sm text-zinc-500">{t("admin.invitePurchase.loading")}</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-7 sm:p-8 mb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white mb-1 flex items-center gap-2">
            <ShoppingBag className="h-5 w-5 text-violet-400" aria-hidden />
            {t("admin.invitePurchase.title")}
          </h2>
          <p className="text-sm text-zinc-500">
            {t("admin.invitePurchase.description")}
          </p>
        </div>
        <button
          type="button"
          aria-label={t("admin.invitePurchase.toggleAria")}
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
            {t("admin.invitePurchase.noPacksPriced")}
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
            {t("admin.invitePurchase.mailNotConfiguredTitle")}
          </p>
          <p className="mt-2">
            {t("admin.invitePurchase.mailNotConfiguredBody")}
          </p>
          <p className="mt-2">
            {t("admin.invitePurchase.mailConfigHint")}
          </p>
          <p className="mt-2 text-red-300/90">
            {t("admin.invitePurchase.mailConfigFulfil")}
          </p>
        </div>
      )}

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {packs.length === 0 ? (
          <p className="text-sm text-zinc-500">{t("admin.invitePurchase.noPacks")}</p>
        ) : (
          packs.map((pack) => (
            <div
              key={pack.quantity}
              className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3"
            >
              <p className="text-sm font-medium text-white">
                {t("admin.invitePurchase.credits", { count: pack.quantity, s: pack.quantity === 1 ? "" : "s" })}
              </p>
              <p className="text-sm text-zinc-400">
                {money(pack.priceCents, currency)}
                <span className="text-zinc-600"> · {t("admin.invitePurchase.eachPrice", { amount: money(pack.unitCents, currency) })}</span>
              </p>
              {pack.bestValue && (
                <p className="mt-1 text-xs font-medium text-emerald-400">{t("admin.invitePurchase.bestValue")}</p>
              )}
            </div>
          ))
        )}
      </div>

      <div className="mt-6 border-t border-zinc-800/70 pt-5">
        <h3 className="text-sm font-semibold text-white mb-1">{t("admin.invitePurchase.resale")}</h3>
        <p className="text-sm text-zinc-500 mb-3">
          {t("admin.invitePurchase.resaleDescription")}
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
                <span className="block text-sm font-medium text-white">{t(mode.label)}</span>
                <span className="block text-xs text-zinc-500">{t(mode.help)}</span>
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
          <h3 className="text-sm font-semibold text-white">{t("admin.invitePurchase.recentPurchases")}</h3>
          <button
            type="button"
            onClick={() => void loadPurchases()}
            className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            {t("admin.invitePurchase.refresh")}
          </button>
        </div>

        {purchases.length === 0 ? (
          <p className="text-sm text-zinc-500">{t("admin.invitePurchase.noPurchases")}</p>
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
                      {statusLabel(purchase.status)}
                    </span>
                    <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                      {methodLabel(purchase.method)}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {t("admin.invitePurchase.credits", { count: purchase.quantity, s: purchase.quantity === 1 ? "" : "s" })} ·{" "}
                    {money(purchase.priceCents, purchase.currency)} ·{" "}
                    {formatDateTime(purchase.createdAt)}
                    {purchase.userId === null && purchase.status === "PAID"
                      ? t("admin.invitePurchase.guestCodesByEmail")
                      : ""}
                    {purchase.claimedById ? t("admin.invitePurchase.adoptedByAccount") : ""}
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
                      {t("admin.invitePurchase.confirm")}
                    </Button>
                  )}
                  {purchase.status === "PAID" && purchase.userId === null && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyOrder === purchase.id}
                      onClick={() => void copyClaimLink(purchase.id)}
                      title={t("admin.invitePurchase.copyClaimLinkTitle")}
                    >
                      {busyOrder === purchase.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        <Link2 className="h-4 w-4" aria-hidden />
                      )}
                      {t("admin.invitePurchase.copyClaimLink")}
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
                          t("admin.invitePurchase.refundConfirm", {
                            provider:
                              purchase.method === "MANUAL"
                                ? t("admin.invitePurchase.paymentProvider")
                                : purchase.method,
                          })
                        );
                        if (paid) void act(purchase.id, "refund");
                      }}
                      title={t("admin.invitePurchase.markRefundedTitle")}
                    >
                      <Ban className="h-4 w-4" aria-hidden />
                      {t("admin.invitePurchase.markRefunded")}
                    </Button>
                  )}
                  {purchase.status === "PENDING" && purchase.method !== "MANUAL" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busyOrder === purchase.id}
                      onClick={() => act(purchase.id, "cancel")}
                    >
                      {t("admin.invitePurchase.cancel")}
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
          {t("admin.invitePurchase.refundFooter")}
        </span>
      </p>
    </div>
  );
}