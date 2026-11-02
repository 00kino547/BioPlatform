import { useCallback, useEffect, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { CreditCard, Receipt, RefreshCw, MessageSquare, Check, Clock, Ban, RotateCcw, Sparkles, ExternalLink, Wallet, Landmark, TrendingDown } from "lucide-react";
import { api, type MyOrders, type OrderConfig, type OrderInfo } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/intl";
import { Dialog } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/useAuth";

// Stable translator type so helpers outside components can translate.
type Translate = ReturnType<typeof useTranslation>["t"];

// Tier ordering, kept in sync with the backend (`routes/orders.ts`).
// Tier *labels* come from t("common:tiers.*") via tierLabel().
const TIER_RANK: Record<string, number> = { FREE: 0, PRO: 1, ENTERPRISE: 2 };

// Downgrade impact bullets (PRO / FREE) live under t("billing.impact.*") in
// the locale files and are rendered as string arrays (returnObjects).

function money(cents: number, currency: string): string {
  try {
    return formatCurrency(cents, currency);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return formatDate(iso);
}

// Status → CSS classes only; the visible label comes from t("common:status.*").
const STATUS_META: Record<string, { cls: string }> = {
  PENDING: { cls: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  PAID: { cls: "bg-green-500/10 text-green-400 border-green-500/20" },
  CANCELLED: { cls: "bg-red-500/10 text-red-400 border-red-500/20" },
  REFUNDED: { cls: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20" },
};

// Order status → i18n key under common.status.*; unknown statuses fall back
// to the raw server value (same as before the i18n pass).
function statusLabel(status: string, t: Translate): string {
  switch (status) {
    case "PENDING": return t("common:status.pending");
    case "PAID": return t("common:status.paid");
    case "CANCELLED": return t("common:status.cancelled");
    case "REFUNDED": return t("common:status.refunded");
    default: return status;
  }
}

// Payment method → i18n key under billing.methods.*; unknown methods fall back
// to the raw server value.
function methodLabel(method: string, t: Translate): string {
  switch (method) {
    case "MANUAL": return t("billing.methods.manual");
    case "STRIPE": return t("billing.methods.stripe");
    case "PAYPAL": return t("billing.methods.paypal");
    case "CRYPTO": return t("billing.methods.crypto");
    default: return method;
  }
}

// Plan tier → i18n key under common.tiers.*; unknown tiers fall back to the
// raw server value.
function tierLabel(tier: string, t: Translate): string {
  switch (tier) {
    case "FREE": return t("common:tiers.free");
    case "PRO": return t("common:tiers.premium");
    case "ENTERPRISE": return t("common:tiers.enterprise");
    default: return tier;
  }
}

export function BillingTab({ currentTier }: { currentTier: string }) {
  // All user-facing strings come from the `dashboard` namespace (billing.* keys).
  const { t } = useTranslation("dashboard");
  const { refreshUser } = useAuth();
  const [data, setData] = useState<MyOrders | null>(null);
  const [config, setConfig] = useState<OrderConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [note, setNote] = useState("");
  const [methodFor, setMethodFor] = useState<Record<string, string>>({});
  const [coinFor, setCoinFor] = useState<Record<string, string>>({});
  const [downgradeTarget, setDowngradeTarget] = useState<"PRO" | "FREE" | null>(null);
  const [downgrading, setDowngrading] = useState(false);

  const load = useCallback(async () => {
    try {
      const [ordersRes, configRes] = await Promise.all([api.getMyOrders(), api.getOrderConfig()]);
      if (ordersRes.success && ordersRes.data) setData(ordersRes.data);
      if (configRes.success && configRes.data) setConfig(configRes.data);
    } catch {
      setError(t("billing.toasts.loadFailed"));
    }
    setLoading(false);
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  // Poll while any PENDING gateway order exists so status flips to PAID automatically.
  const pollRef = useRef(0);
  useEffect(() => {
    const hasPendingGateway = (data?.orders ?? []).some((o) => o.status === "PENDING" && o.method !== "MANUAL");
    if (hasPendingGateway && !pollRef.current) {
      pollRef.current = window.setInterval(() => load(), 5000);
    } else if (!hasPendingGateway && pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = 0;
    }
  }, [data, load]);

  useEffect(() => () => window.clearInterval(pollRef.current), []);

  const createOrder = async (plan: string) => {
    const method = methodFor[plan] ?? "MANUAL";
    const coin = coinFor[plan];
    setBusyPlan(plan);
    setError("");
    try {
      const res = await api.createOrder({
        plan: plan as "PRO" | "ENTERPRISE",
        method: method as "MANUAL" | "STRIPE" | "PAYPAL" | "CRYPTO",
        note: note.trim() || undefined,
        coin,
      });
      if (res.success && res.data) {
        setNote("");
        const url = res.checkout?.url ?? res.data.gatewayCheckoutUrl;
        if (res.data.method !== "MANUAL" && url) {
          window.open(url, "_blank", "noopener,noreferrer");
        }
        await load();
      } else {
        setError(res.error ?? t("billing.toasts.createFailed"));
      }
    } catch {
      setError(t("billing.toasts.createFailed"));
    }
    setBusyPlan(null);
  };

  const payPending = (o: OrderInfo) => {
    if (o.gatewayCheckoutUrl) window.open(o.gatewayCheckoutUrl, "_blank", "noopener,noreferrer");
  };

  // Confirmed self-service downgrade: moves the account to a lower tier, then
  // refreshes both this panel and the global auth user so every tier gate in the
  // dashboard reflects the new plan immediately.
  const confirmDowngrade = async () => {
    if (!downgradeTarget) return;
    setDowngrading(true);
    setError("");
    try {
      const res = await api.downgradeTier(downgradeTarget);
      if (res.success && res.data) {
        setNotice(t("billing.nowOnPlan", { tier: tierLabel(res.data.tier, t) }));
        setDowngradeTarget(null);
        await Promise.all([load(), refreshUser()]);
      } else {
        setError(res.error ?? t("billing.toasts.downgradeFailed"));
      }
    } catch {
      setError(t("billing.toasts.downgradeFailed"));
    }
    setDowngrading(false);
  };

  if (loading) {
    return <p className="text-sm text-zinc-500 text-center py-12">{t("billing.loading")}</p>;
  }

  const currency = config?.currency ?? data?.billing.currency ?? "USD";
  const discount = data?.discountPercent ?? 0;
  const contact = config?.contact ?? { method: "none", value: "" };
  const contactLabel =
    contact.method === "none"
      ? null
      : contact.method === "email"
        ? contact.value
        : `${contact.method[0].toUpperCase() + contact.method.slice(1)}: ${contact.value}`;
  const gateways = config?.gateways;
  const availableMethods: string[] = ["MANUAL"];
  if (gateways?.stripe) availableMethods.push("STRIPE");
  if (gateways?.paypal) availableMethods.push("PAYPAL");
  if (gateways?.crypto.enabled) availableMethods.push("CRYPTO");
  const cryptoCoins = gateways?.crypto.coins ?? [];
  const proposals = (data?.billing.plans ?? []).map((p) => {
    const final = discount > 0 ? Math.round((p.priceCents * (100 - discount)) / 100) : p.priceCents;
    return { ...p, final };
  });
  const pendingOrders = (data?.orders ?? []).filter((o) => o.status === "PENDING");
  const currentRank = TIER_RANK[currentTier] ?? 0;
  // Lower tiers this account may self-downgrade to (Free is not part of the
  // paid `plans` list, so it is offered here explicitly).
  const downgradeOptions: Array<{ tier: "PRO" | "FREE"; label: string }> =
    currentTier === "ENTERPRISE"
      ? [{ tier: "PRO", label: tierLabel("PRO", t) }, { tier: "FREE", label: tierLabel("FREE", t) }]
      : currentTier === "PRO"
        ? [{ tier: "FREE", label: tierLabel("FREE", t) }]
        : [];

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>
      )}
      {notice && (
        <div className="rounded-lg border border-green-500/20 bg-green-500/10 px-4 py-3 text-sm text-green-400">{notice}</div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3.5">
          <div className="flex items-center gap-2 mb-2">
            <CreditCard className="h-4 w-4 text-violet-400" />
            <h4 className="text-sm font-medium text-white">{t("billing.currentPlan")}</h4>
          </div>
          <p className="text-2xl font-bold text-white capitalize">{currentTier.toLowerCase()}</p>
          <p className="text-xs text-zinc-500 mt-1">
            {data?.billing.billingMode === "one-time" ? t("billing.billedOnceTime") : t("billing.billingMode", { mode: data?.billing.billingMode })}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3.5">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-4 w-4 text-violet-400" />
            <h4 className="text-sm font-medium text-white">{t("billing.yourDiscount")}</h4>
          </div>
          <p className="text-2xl font-bold text-white">{discount}%</p>
          <p className="text-xs text-zinc-500 mt-1">{t("billing.discountAuto")}</p>
        </div>
      </div>

      <div>
        <h4 className="text-sm font-medium text-white mb-3">{t("billing.plansTitle")}</h4>
        <div className="grid gap-4 sm:grid-cols-2">
          {proposals.map((p) => {
            const isCurrent = currentTier === p.plan;
            const isUpgrade = currentTier === "FREE" || (currentTier === "PRO" && p.plan === "ENTERPRISE");
            const isDowngrade = (TIER_RANK[p.plan] ?? 0) < currentRank;
            const pending = pendingOrders.find((o) => o.plan === p.plan);
            return (
              <div key={p.plan} className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3.5">
                <div className="flex items-center justify-between mb-2">
                  <h5 className="text-sm font-semibold text-white">{p.label}</h5>
                  {isCurrent && <span className="text-xs text-zinc-500">{t("billing.current")}</span>}
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-white">{money(p.final, currency)}</span>
                  {discount > 0 && (
                    <span className="text-xs text-zinc-500 line-through">{money(p.priceCents, currency)}</span>
                  )}
                </div>
                <p className="text-xs text-zinc-500 mt-1 mb-3">
                  {data?.billing.billingMode === "one-time" ? t("billing.oneTimeIncludes") : p.label}
                </p>

                {pending && pending.method !== "MANUAL" ? (
                  <button
                    type="button"
                    onClick={() => payPending(pending)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-violet-500/30 bg-violet-600/20 px-4 py-2 text-sm font-medium text-violet-300 hover:bg-violet-600/30 transition-all"
                  >
                    <ExternalLink className="h-4 w-4" /> {t("billing.finishPayment", { method: methodLabel(pending.method, t) })}
                  </button>
                ) : pending ? (
                  <button
                    type="button"
                    disabled
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium cursor-not-allowed border border-amber-500/30 bg-amber-500/10 text-amber-400"
                  >
                    <Clock className="h-4 w-4" /> {t("billing.awaitingOwner")}
                  </button>
                ) : (
                  <>
                    {isUpgrade && !isCurrent ? (
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-1.5">
                          {availableMethods.map((m) => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => setMethodFor((s) => ({ ...s, [p.plan]: m }))}
                              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-all ${
                                (methodFor[p.plan] ?? "MANUAL") === m
                                  ? "border-violet-500/50 bg-violet-600/20 text-violet-300"
                                  : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-white"
                              }`}
                            >
                              {m === "STRIPE" ? <Landmark className="h-3 w-3" /> : m === "CRYPTO" ? <Wallet className="h-3 w-3" /> : null}
                              {methodLabel(m, t)}
                            </button>
                          ))}
                        </div>
                        {(methodFor[p.plan] ?? "MANUAL") === "CRYPTO" && cryptoCoins.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {cryptoCoins.map((c) => (
                              <button
                                key={c}
                                type="button"
                                onClick={() => setCoinFor((s) => ({ ...s, [p.plan]: c }))}
                                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-all ${
                                  (coinFor[p.plan] ?? cryptoCoins[0]) === c
                                    ? "border-violet-500/50 bg-violet-600/20 text-violet-300"
                                    : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-white"
                                }`}
                              >
                                {c}
                              </button>
                            ))}
                          </div>
                        )}
                        <button
                          type="button"
                          disabled={busyPlan === p.plan}
                          onClick={() => createOrder(p.plan)}
                          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 transition-all disabled:opacity-60"
                        >
                          {busyPlan === p.plan ? t("billing.creating") : t("billing.upgradeTo", { label: p.label })}
                        </button>
                      </div>
                    ) : isDowngrade ? (
                      <button
                        type="button"
                        onClick={() => setDowngradeTarget(p.plan as "PRO")}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-400 hover:bg-amber-500/20 transition-all"
                      >
                        <TrendingDown className="h-4 w-4" /> {t("billing.downgradeTo", { label: p.label })}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium cursor-not-allowed border border-zinc-700 text-zinc-500"
                      >
                        {isCurrent ? t("billing.alreadyOnPlan") : t("billing.notAvailable")}
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {downgradeOptions.length > 0 && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3.5">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="h-4 w-4 text-amber-400" />
            <h4 className="text-sm font-medium text-white">{t("billing.downgradeHeading")}</h4>
          </div>
          <p className="text-xs text-zinc-500 mb-3">
            {t("billing.downgradeDescription")}
          </p>
          <div className="flex flex-wrap gap-2">
            {downgradeOptions.map((o) => (
              <button
                key={o.tier}
                type="button"
                onClick={() => setDowngradeTarget(o.tier)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3.5 py-2 text-sm font-medium text-amber-400 hover:bg-amber-500/20 transition-all"
              >
                <TrendingDown className="h-3.5 w-3.5" /> {t("billing.downTo", { label: o.label })}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3.5">
        <div className="flex items-center gap-2 mb-2">
          <MessageSquare className="h-4 w-4 text-violet-400" />
          <h4 className="text-sm font-medium text-white">{t("billing.payManually")}</h4>
        </div>
        <p className="text-xs text-zinc-500 mb-3">
          <Trans
            ns="dashboard"
            i18nKey="billing.manualPayBody"
            components={{ 0: <span className="text-zinc-300" /> }}
          />
          {contactLabel ? (
            <> {t("billing.reachThem")} <span className="text-violet-400">{contactLabel}</span></>
          ) : (
            <> {t("billing.noContactYet")}</>
          )}
        </p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder={t("billing.notePlaceholder")}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500"
        />
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3.5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-violet-400" />
            <h4 className="text-sm font-medium text-white">{t("billing.orderHistory")}</h4>
          </div>
          <button onClick={load} className="text-xs text-zinc-400 hover:text-white transition-colors flex items-center gap-1">
            <RefreshCw className="h-3 w-3" /> {t("billing.refresh")}
          </button>
        </div>
        {(data?.orders.length ?? 0) === 0 ? (
          <p className="text-sm text-zinc-500 py-2">{t("billing.noOrders")}</p>
        ) : (
          <div className="space-y-2">
            {data?.orders.map((o) => (
              <div key={o.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-800 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white">
                    {o.planLabel} · {money(o.finalPriceCents, o.currency)}
                    {o.method !== "MANUAL" && o.method !== "CRYPTO" ? "" : null}
                    {o.method !== "MANUAL" ? (
                      <span className={`ml-1.5 rounded-full border px-1.5 py-0.5 text-[10px] ${o.method === "CRYPTO" ? "border-violet-500/30 bg-violet-500/10 text-violet-300" : "border-zinc-700 bg-zinc-800 text-zinc-400"}`}>
                        {methodLabel(o.method, t)}
                        {o.method === "CRYPTO" && o.cryptoCoin && o.cryptoAmount ? ` · ${o.cryptoAmount} ${o.cryptoCoin}` : ""}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {t("billing.created", { date: fmtDate(o.createdAt) })}
                    {o.discountPercent > 0 ? t("billing.discountSuffix", { percent: o.discountPercent }) : ""}
                    {o.adminNote ? ` · ${o.adminNote}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {o.status === "PENDING" && o.method !== "MANUAL" && o.gatewayCheckoutUrl && (
                    <button
                      onClick={() => payPending(o)}
                      className="inline-flex items-center gap-1 rounded-lg border border-violet-500/30 bg-violet-600/20 px-2.5 py-1 text-xs font-medium text-violet-300 hover:bg-violet-600/30 transition-all"
                    >
                      <ExternalLink className="h-3 w-3" /> {t("billing.payNow")}
                    </button>
                  )}
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_META[o.status]?.cls ?? ""}`}>
                    {o.status === "PAID" ? <Check className="h-3 w-3" /> : o.status === "PENDING" ? <Clock className="h-3 w-3" /> : o.status === "CANCELLED" ? <Ban className="h-3 w-3" /> : <RotateCcw className="h-3 w-3" />}
                    {statusLabel(o.status, t)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog
        open={downgradeTarget !== null}
        onClose={() => {
          if (!downgrading) setDowngradeTarget(null);
        }}
        title={
          downgradeTarget
            ? t("billing.downgradeConfirmTitle", { tier: tierLabel(downgradeTarget, t) })
            : t("billing.downgradeHeading")
        }
      >
        {downgradeTarget && (
          <div>
            <p className="text-sm text-zinc-400">
              <Trans
                ns="dashboard"
                i18nKey="billing.downgradeMoves"
                values={{
                  from: tierLabel(currentTier, t),
                  to: tierLabel(downgradeTarget, t),
                }}
                components={{
                  0: <span className="font-medium text-white" />,
                  1: <span className="font-medium text-white" />,
                }}
              />
            </p>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-zinc-400">
              {(
                (downgradeTarget === "PRO"
                  ? t("billing.impact.PRO", { returnObjects: true })
                  : t("billing.impact.FREE", { returnObjects: true })) as string[]
              ).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-zinc-500">
              {t("billing.downgradeNote")}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDowngradeTarget(null)}
                disabled={downgrading}
                className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-all disabled:opacity-60"
              >
                {t("billing.cancel")}
              </button>
              <button
                type="button"
                onClick={confirmDowngrade}
                disabled={downgrading}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 transition-all disabled:opacity-60"
              >
                <TrendingDown className="h-4 w-4" />
                {downgrading
                  ? t("billing.downgrading")
                  : t("billing.downgradeTo", { label: tierLabel(downgradeTarget, t) })}
              </button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
