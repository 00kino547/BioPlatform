import { useCallback, useEffect, useRef, useState } from "react";
import { CreditCard, Receipt, RefreshCw, MessageSquare, Check, Clock, Ban, RotateCcw, Sparkles, ExternalLink, Wallet, Landmark, TrendingDown } from "lucide-react";
import { api, type MyOrders, type OrderConfig, type OrderInfo } from "@/lib/api";
import { Dialog } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";

// Tier ordering + labels, kept in sync with the backend (`routes/orders.ts`).
const TIER_RANK: Record<string, number> = { FREE: 0, PRO: 1, ENTERPRISE: 2 };
const TIER_LABELS: Record<string, string> = { FREE: "Free", PRO: "Premium", ENTERPRISE: "Enterprise" };

// Human-readable description of what a given target plan locks. Shown in the
// downgrade confirmation so the move is never a surprise; nothing is deleted.
const DOWNGRADE_IMPACT: Record<"PRO" | "FREE", string[]> = {
  PRO: [
    "Enterprise-only features become locked: business SSO, team seats and the enterprise webhooks API.",
    "Limits change to 3 profiles, 5 aliases and 5 music tracks.",
    "Custom domains stay enabled (Premium keeps them).",
  ],
  FREE: [
    "Premium-only features become locked: custom domains, advanced analytics, Discord integration, data export and the webhooks API.",
    "Limits change to 1 profile, 0 aliases, 2 music tracks and 3 shop products.",
    "Existing profiles, aliases, tracks and products are kept — they just can't grow past the new limits.",
  ],
};

function money(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString();
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "Pending", cls: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  PAID: { label: "Paid", cls: "bg-green-500/10 text-green-400 border-green-500/20" },
  CANCELLED: { label: "Cancelled", cls: "bg-red-500/10 text-red-400 border-red-500/20" },
  REFUNDED: { label: "Refunded", cls: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20" },
};

const METHOD_LABELS: Record<string, string> = {
  MANUAL: "Contact owner",
  STRIPE: "Card",
  PAYPAL: "PayPal",
  CRYPTO: "Crypto",
};

export function BillingTab({ currentTier }: { currentTier: string }) {
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
      setError("Could not load billing information");
    }
    setLoading(false);
  }, []);

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
        setError(res.error ?? "Could not create the order");
      }
    } catch {
      setError("Could not create the order");
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
        setNotice(`You're now on the ${TIER_LABELS[res.data.tier] ?? res.data.tier} plan.`);
        setDowngradeTarget(null);
        await Promise.all([load(), refreshUser()]);
      } else {
        setError(res.error ?? "Could not downgrade the plan");
      }
    } catch {
      setError("Could not downgrade the plan");
    }
    setDowngrading(false);
  };

  if (loading) {
    return <p className="text-sm text-zinc-500 text-center py-12">Loading billing…</p>;
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
      ? [{ tier: "PRO", label: "Premium" }, { tier: "FREE", label: "Free" }]
      : currentTier === "PRO"
        ? [{ tier: "FREE", label: "Free" }]
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
            <h4 className="text-sm font-medium text-white">Current plan</h4>
          </div>
          <p className="text-2xl font-bold text-white capitalize">{currentTier.toLowerCase()}</p>
          <p className="text-xs text-zinc-500 mt-1">
            {data?.billing.billingMode === "one-time" ? "Billed as a one-time payment" : `Billing: ${data?.billing.billingMode}`}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3.5">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-4 w-4 text-violet-400" />
            <h4 className="text-sm font-medium text-white">Your discount</h4>
          </div>
          <p className="text-2xl font-bold text-white">{discount}%</p>
          <p className="text-xs text-zinc-500 mt-1">Applied automatically at checkout</p>
        </div>
      </div>

      <div>
        <h4 className="text-sm font-medium text-white mb-3">Plans</h4>
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
                  {isCurrent && <span className="text-xs text-zinc-500">Current</span>}
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-white">{money(p.final, currency)}</span>
                  {discount > 0 && (
                    <span className="text-xs text-zinc-500 line-through">{money(p.priceCents, currency)}</span>
                  )}
                </div>
                <p className="text-xs text-zinc-500 mt-1 mb-3">
                  {data?.billing.billingMode === "one-time" ? "One-time payment · includes your discount" : p.label}
                </p>

                {pending && pending.method !== "MANUAL" ? (
                  <button
                    type="button"
                    onClick={() => payPending(pending)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-violet-500/30 bg-violet-600/20 px-4 py-2 text-sm font-medium text-violet-300 hover:bg-violet-600/30 transition-all"
                  >
                    <ExternalLink className="h-4 w-4" /> Finish payment ({METHOD_LABELS[pending.method] ?? pending.method})
                  </button>
                ) : pending ? (
                  <button
                    type="button"
                    disabled
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium cursor-not-allowed border border-amber-500/30 bg-amber-500/10 text-amber-400"
                  >
                    <Clock className="h-4 w-4" /> Awaiting owner
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
                              {METHOD_LABELS[m] ?? m}
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
                          {busyPlan === p.plan ? "Creating…" : `Upgrade to ${p.label}`}
                        </button>
                      </div>
                    ) : isDowngrade ? (
                      <button
                        type="button"
                        onClick={() => setDowngradeTarget(p.plan as "PRO")}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-400 hover:bg-amber-500/20 transition-all"
                      >
                        <TrendingDown className="h-4 w-4" /> Downgrade to {p.label}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium cursor-not-allowed border border-zinc-700 text-zinc-500"
                      >
                        {isCurrent ? "Already on this plan" : "Not available"}
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
            <h4 className="text-sm font-medium text-white">Downgrade plan</h4>
          </div>
          <p className="text-xs text-zinc-500 mb-3">
            Move to a lower plan at any time. Nothing is deleted — your extra profiles, aliases, tracks and products stay in
            your account (they just can&apos;t grow past the new plan&apos;s limits) and premium-only features lock until you
            upgrade again. Any pending order is cancelled.
          </p>
          <div className="flex flex-wrap gap-2">
            {downgradeOptions.map((o) => (
              <button
                key={o.tier}
                type="button"
                onClick={() => setDowngradeTarget(o.tier)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3.5 py-2 text-sm font-medium text-amber-400 hover:bg-amber-500/20 transition-all"
              >
                <TrendingDown className="h-3.5 w-3.5" /> Down to {o.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3.5">
        <div className="flex items-center gap-2 mb-2">
          <MessageSquare className="h-4 w-4 text-violet-400" />
          <h4 className="text-sm font-medium text-white">Pay manually</h4>
        </div>
        <p className="text-xs text-zinc-500 mb-3">
          The <span className="text-zinc-300">Contact owner</span> option creates a pending order that the platform owner
          fulfills after you pay out of band — add a message about your payment method if you&apos;d like.
          {contactLabel ? (
            <> Reach them at: <span className="text-violet-400">{contactLabel}</span></>
          ) : (
            <> The instance owner hasn&apos;t set a contact method yet — the note you leave helps them reach you.</>
          )}
        </p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder="Optional note (e.g. preferred way to pay)…"
          className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500"
        />
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3.5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-violet-400" />
            <h4 className="text-sm font-medium text-white">Order history</h4>
          </div>
          <button onClick={load} className="text-xs text-zinc-400 hover:text-white transition-colors flex items-center gap-1">
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
        </div>
        {(data?.orders.length ?? 0) === 0 ? (
          <p className="text-sm text-zinc-500 py-2">No orders yet.</p>
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
                        {METHOD_LABELS[o.method] ?? o.method}
                        {o.method === "CRYPTO" && o.cryptoCoin && o.cryptoAmount ? ` · ${o.cryptoAmount} ${o.cryptoCoin}` : ""}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-zinc-500">
                    Created {fmtDate(o.createdAt)}
                    {o.discountPercent > 0 ? ` · ${o.discountPercent}% discount` : ""}
                    {o.adminNote ? ` · ${o.adminNote}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {o.status === "PENDING" && o.method !== "MANUAL" && o.gatewayCheckoutUrl && (
                    <button
                      onClick={() => payPending(o)}
                      className="inline-flex items-center gap-1 rounded-lg border border-violet-500/30 bg-violet-600/20 px-2.5 py-1 text-xs font-medium text-violet-300 hover:bg-violet-600/30 transition-all"
                    >
                      <ExternalLink className="h-3 w-3" /> Pay now
                    </button>
                  )}
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_META[o.status]?.cls ?? ""}`}>
                    {o.status === "PAID" ? <Check className="h-3 w-3" /> : o.status === "PENDING" ? <Clock className="h-3 w-3" /> : o.status === "CANCELLED" ? <Ban className="h-3 w-3" /> : <RotateCcw className="h-3 w-3" />}
                    {STATUS_META[o.status]?.label ?? o.status}
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
        title={downgradeTarget ? `Downgrade to ${TIER_LABELS[downgradeTarget]}?` : "Downgrade plan"}
      >
        {downgradeTarget && (
          <div>
            <p className="text-sm text-zinc-400">
              Your account will move from{" "}
              <span className="font-medium text-white">{TIER_LABELS[currentTier] ?? currentTier}</span> to{" "}
              <span className="font-medium text-white">{TIER_LABELS[downgradeTarget]}</span> immediately.
            </p>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-zinc-400">
              {DOWNGRADE_IMPACT[downgradeTarget].map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-zinc-500">
              Nothing is deleted, and you can upgrade again at any time. Any pending order is cancelled.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDowngradeTarget(null)}
                disabled={downgrading}
                className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-all disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDowngrade}
                disabled={downgrading}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 transition-all disabled:opacity-60"
              >
                <TrendingDown className="h-4 w-4" />
                {downgrading ? "Downgrading…" : `Downgrade to ${TIER_LABELS[downgradeTarget]}`}
              </button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}