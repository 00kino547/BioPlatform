import { useCallback, useEffect, useState } from "react";
import {
  api,
  type InvitePack,
  type InvitePurchaseStore,
  type InvitePurchaseSummary,
} from "@/lib/api";
import { Check, Copy, CreditCard, Loader2, Mail, ShoppingBag, TriangleAlert } from "lucide-react";

// The paid-invite storefront.
//
// Shared by the signed-in settings tab and the public guest page: a prospective
// member has no account, and registration is invite-only, so they are exactly the
// person who needs to discover that invites are for sale. Both render the same
// component rather than keeping two copies of the checkout logic.

const METHODS = [
  { value: "STRIPE", label: "Card" },
  { value: "PAYPAL", label: "PayPal" },
  { value: "CRYPTO", label: "Crypto" },
  { value: "MANUAL", label: "Pay by hand" },
] as const;

function money(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
  } catch {
    // A malformed currency must not take the whole checkout down.
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

export function InviteCreditStore({
  showEmailField,
  initialEmail,
  defaultMethod = "STRIPE",
  onPurchased,
}: {
  /** Guests are identified only by the email the codes are sent to. */
  showEmailField?: boolean;
  /**
   * Seeds the guest email field.
   *
   * Set when the store is opened from a form the visitor has already filled in
   * (register, login), so they do not retype the address the codes will be sent
   * to. Seeded on mount only: the field belongs to them once they start editing.
   */
  initialEmail?: string;
  defaultMethod?: (typeof METHODS)[number]["value"];
  onPurchased?: (order: InvitePurchaseSummary) => void;
}) {
  const [store, setStore] = useState<InvitePurchaseStore | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<InvitePack | null>(null);
  const [method, setMethod] = useState<(typeof METHODS)[number]["value"]>(defaultMethod);
  const [email, setEmail] = useState(() => initialEmail ?? "");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [history, setHistory] = useState<InvitePurchaseSummary[]>([]);
  // Sticky "check your spam folder" reminder for guests, whose codes only ever
  // arrive by email. Deliberately its own state rather than part of `notice`.
  const [spamHint, setSpamHint] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.getInvitePurchaseStore();
      if (res.success && res.data) {
        setStore(res.data);
        // Preselect the smallest pack so the page never opens in a dead state.
        setSelected((current) => current ?? res.data!.packs[0] ?? null);
      }
    } catch {
      setNotice({ tone: "err", text: "Could not load the invite store." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /*
    "Pay by hand" is only offered when the operator published instructions: the
    backend reports `configured` from the stored setting rather than from the
    presence of the choice, so a method selected without a value cannot leave a
    buyer stuck at a checkout they have no way to pay.
  */
  const manualAvailable = store?.manualPayment.configured === true;
  const offeredMethods = manualAvailable
    ? METHODS
    : METHODS.filter((option) => option.value !== "MANUAL");

  // A guest may arrive with MANUAL preselected (or have it preselected before the
  // store loaded); fall back to the default rather than leaving an unpayable
  // selection showing.
  useEffect(() => {
    if (store && method === "MANUAL" && !manualAvailable) setMethod(defaultMethod);
  }, [store, method, manualAvailable, defaultMethod]);

  // Purchase history is member-only; a guest has no session to read it with.
  useEffect(() => {
    if (showEmailField) return;
    void (async () => {
      const res = await api.getInvitePurchases();
      if (res.success && res.data) setHistory(res.data.purchases);
    })();
  }, [showEmailField]);

  const buy = async () => {
    if (!selected) return;
    if (showEmailField && !email.trim()) {
      setNotice({ tone: "err", text: "Enter the email the codes should be sent to." });
      return;
    }
    setBusy(true);
    setNotice(null);
    const res = await api.buyInviteCredits({
      quantity: selected.quantity,
      method,
      ...(showEmailField ? { email: email.trim() } : {}),
    });
    setBusy(false);

    if (!res.success || !res.data) {
      setNotice({ tone: "err", text: res.error ?? "Could not start the purchase." });
      return;
    }

    // Gateways hand back a redirect; manual waits for the operator to confirm.
    if (res.data.checkout?.url) {
      window.location.href = res.data.checkout.url;
      return;
    }

    onPurchased?.(res.data);
    setNotice({
      tone: "ok",
      text:
        method === "MANUAL"
          ? "Order created. The operator will confirm it shortly."
          : "Order created. Your codes arrive by email once it is confirmed.",
    });
    // Kept as a separate, always-visible line rather than folded into the notice
    // above: "check spam" is the instruction that decides whether a buyer finds
    // their codes, and a transient success message is the wrong home for it.
    setSpamHint(true);
    void load();
  };

  const copy = async (orderId: string) => {
    const res = await api.getOwnInviteClaimLink(orderId);
    if (!res.success || !res.data) {
      setNotice({ tone: "err", text: res.error ?? "Could not get the link." });
      return;
    }
    await navigator.clipboard.writeText(res.data.url);
    setCopied(orderId);
    window.setTimeout(() => setCopied(null), 2000);
  };

  if (loading) {
    return (
      <p className="text-sm text-zinc-500" role="status">
        Loading…
      </p>
    );
  }

  if (!store) {
    return (
      <p className="flex items-start gap-2 text-sm text-zinc-500">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        The invite store is unavailable right now.
      </p>
    );
  }

  if (!store.open) {
    return (
      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-6">
        <p className="flex items-start gap-2 text-sm text-zinc-400">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            Invite credits are not for sale on this instance. If you have an invite code, you can
            still use it to register.
          </span>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {store.packs.map((pack) => {
          const active = selected?.quantity === pack.quantity;
          return (
            <button
              key={pack.quantity}
              type="button"
              onClick={() => setSelected(pack)}
              aria-pressed={active}
              className={`rounded-2xl border p-5 text-left transition-all ${
                active
                  ? "border-violet-500 bg-violet-500/10 shadow-lg shadow-violet-500/10"
                  : "border-zinc-800 bg-zinc-900/30 hover:border-zinc-700 hover:bg-zinc-900/50"
              }`}
            >
              <p className="text-sm text-zinc-400">
                {pack.quantity} invite credit{pack.quantity === 1 ? "" : "s"}
              </p>
              <p className="mt-1 text-2xl font-semibold text-white">
                {money(pack.priceCents, store.currency)}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                {money(pack.unitCents, store.currency)} each
              </p>
              {pack.bestValue && (
                <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                  <Check className="h-3 w-3" aria-hidden />
                  Best value
                </p>
              )}
            </button>
          );
        })}
      </div>

      <div className="space-y-4 rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-6">
        {showEmailField && (
          <div>
            <label htmlFor="invite-buy-email" className="mb-1.5 block text-sm font-medium text-zinc-300">
              Where should the codes go?
            </label>
            <div className="relative">
              <Mail
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
                aria-hidden
              />
              <input
                id="invite-buy-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 py-2.5 pl-10 pr-4 text-sm text-white outline-none transition-colors placeholder-zinc-600 focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
              />
            </div>
            <p className="mt-1.5 text-xs text-zinc-500">
              You do not need an account to buy. Redeem one of the codes to register, and the
              remaining codes are added to your new account automatically.
            </p>
            {spamHint && (
              <p className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
                <strong>Check your spam folder.</strong> Your codes are delivered by email as soon
                as the payment is confirmed, and automated mail from a new domain is often filed
                straight into junk — it is not a sign that anything went wrong. If it has not
                arrived, search for the sender address and mark it as "not spam" so future mail
                reaches your inbox.
              </p>
            )}
          </div>
        )}

        <div>
          <span className="mb-1.5 block text-sm font-medium text-zinc-300">Payment method</span>
          <div className="flex flex-wrap gap-2">
            {offeredMethods.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setMethod(option.value)}
                aria-pressed={method === option.value}
                className={`rounded-lg border px-4 py-2 text-sm transition-colors ${
                  method === option.value
                    ? "border-violet-500 bg-violet-500/10 text-white"
                    : "border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:border-zinc-700 hover:text-white"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          {/*
            The point of the pay-by-hand instructions: a buyer must be told where to
            send the money. When the operator has published none the option is not
            offered at all, rather than offering a checkout that cannot be paid.
          */}
          {method === "MANUAL" && store.manualPayment.configured ? (
            <div className="mt-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2.5">
              <p className="text-xs text-zinc-500">
                Send payment to{" "}
                <span className="font-medium text-zinc-200">{store.manualPayment.value}</span>{" "}
                <span className="capitalize">({store.manualPayment.method})</span>, then reference your order.
                The operator confirms this by hand, so it is not instant.
              </p>
            </div>
          ) : null}
        </div>

        {notice && (
          <p
            role="status"
            className={`rounded-lg px-4 py-3 text-sm ${
              notice.tone === "ok"
                ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                : "bg-red-500/10 border border-red-500/20 text-red-400"
            }`}
          >
            {notice.text}
          </p>
        )}

        <button
          type="button"
          onClick={buy}
          disabled={busy || !selected}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <ShoppingBag className="h-4 w-4" aria-hidden />
          )}
          {selected
            ? `Buy ${selected.quantity} credit${selected.quantity === 1 ? "" : "s"} for ${money(selected.priceCents, store.currency)}`
            : "Select a pack"}
        </button>

        {store.resale.clause !== "none" && (
          <p className="text-xs text-zinc-500">
            <CreditCard className="mr-1 inline h-3.5 w-3.5" aria-hidden />
            {store.resale.clause === "prohibited"
              ? "This instance does not permit invite codes to be resold. See the Terms."
              : "Invite codes on this instance may be resold. See the Terms."}
          </p>
        )}
      </div>

      {history.length > 0 && (
        <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-6">
          <h3 className="text-sm font-semibold text-white">Your purchases</h3>
          <ul className="mt-3 space-y-2">
            {history.map((order) => (
              <li
                key={order.id}
                className="flex flex-col gap-2 rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm text-white">
                    {order.quantity} credit{order.quantity === 1 ? "" : "s"} ·{" "}
                    {money(order.priceCents, order.currency)}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {order.status.toLowerCase()} · {new Date(order.createdAt).toLocaleString()}
                  </p>
                </div>
                {order.status === "PAID" && (
                  <button
                    type="button"
                    onClick={() => copy(order.id)}
                    className="inline-flex items-center gap-1.5 self-start text-xs text-violet-400 transition-colors hover:text-violet-300 sm:self-auto"
                  >
                    {copied === order.id ? (
                      <Check className="h-3.5 w-3.5" aria-hidden />
                    ) : (
                      <Copy className="h-3.5 w-3.5" aria-hidden />
                    )}
                    {copied === order.id ? "Link copied" : "Copy claim link"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}