import { useEffect, useState, useRef } from "react";
import { ShoppingCart, X, Loader2, CheckCircle2, AlertCircle, ExternalLink, Send } from "lucide-react";
import { api } from "@/lib/api";
import type { ShopAvailability, ShopProductPublic, PurchaseStatus } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { formatPrice } from "@/lib/format";

interface ShopBlockProps {
  products: ShopProductPublic[];
  discountPercent?: number | null;
  accent: string;
  textColor: string;
  mutedColor: string;
}

type Method = "STRIPE" | "PAYPAL" | "CRYPTO";

const GRADIENT = "linear-gradient(135deg, #8b5cf6, #3b82f6)";

function availableMethods(a: ShopAvailability | null): Method[] {
  if (!a) return ["STRIPE", "PAYPAL", "CRYPTO"];
  const m: Method[] = [];
  if (a.stripe) m.push("STRIPE");
  if (a.paypal) m.push("PAYPAL");
  if (a.crypto) m.push("CRYPTO");
  return m;
}

function BuyDialog({
  product,
  currency,
  discountPercent,
  methods,
  coins,
  accent,
  textColor,
  mutedColor,
  onClose,
}: {
  product: ShopProductPublic;
  currency: string;
  discountPercent?: number | null;
  methods: Method[];
  coins: string[];
  accent: string;
  textColor: string;
  mutedColor: string;
  onClose: () => void;
}) {
  const [method, setMethod] = useState<Method>(methods[0] ?? "STRIPE");
  const [coin, setCoin] = useState("");
  const [email, setEmail] = useState("");
  const [requestText, setRequestText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<PurchaseStatus | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { user } = useAuth();

  const isFree = product.priceCents === 0;
  const isRequestType = product.type === "REQUEST";
  const hasDiscount = (discountPercent ?? 0) > 0;
  const originalPrice = hasDiscount ? Math.round(product.priceCents * 100 / (100 - (discountPercent ?? 1))) : null;

  // Prefill the buyer's email for signed-in users; it stays editable.
  useEffect(() => {
    if (user?.email && !email) setEmail(user.email);
  }, [user?.email, email]);

  useEffect(() => {
    if (coins.length > 0) setCoin(coins[0]);
  }, [coins]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const pollStatus = (purchaseId: string, clientToken: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await api.getPurchaseStatus(purchaseId, clientToken);
        const s = res.data?.status ?? "PENDING";
        if (s === "PAID") {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setStatus("PAID");
          if (res.downloadUrl) {
            setDownloadUrl(res.downloadUrl);
          } else {
            const again = await api.getPurchaseStatus(purchaseId, clientToken);
            setDownloadUrl(again.downloadUrl ?? null);
          }
        } else if (s === "CANCELLED" || s === "REFUNDED") {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setStatus(s);
        }
      } catch {
        // keep polling
      }
    }, 2500);
  };

  const buy = async () => {
    setLoading(true);
    setError("");
    setStatus(null);
    setDownloadUrl(null);
    try {
      const res = await api.buyProduct({
        productId: product.id,
        method: isFree ? undefined : method,
        email: email.trim() || undefined,
        coin: method === "CRYPTO" ? coin : undefined,
        requestText: isRequestType ? requestText.trim() : undefined,
      });
      if (!res.success || !res.data) {
        setError(res.error ?? "Something went wrong.");
        setLoading(false);
        return;
      }
      if (res.status === "PAID") {
        setStatus("PAID");
        setDownloadUrl(res.downloadUrl ?? null);
      } else if (res.checkout?.url) {
        setStatus("PENDING");
        window.open(res.checkout.url, "_blank", "noopener");
        if (res.clientToken) pollStatus(res.data.id, res.clientToken);
      } else {
        setStatus(res.status);
      }
    } catch {
      setError("Network error. Please try again.");
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl p-5 shadow-xl relative"
        style={{ backgroundColor: "#18181b", color: textColor, border: "1px solid #27272a" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-3 right-3 opacity-50 hover:opacity-100 transition-opacity" style={{ color: textColor }}>
          <X className="h-5 w-5" />
        </button>

        {product.previewImage && (
          <img src={product.previewImage} alt={product.title} className="w-full h-24 object-cover rounded-lg mb-3" />
        )}
        <p className="text-sm font-semibold mb-1 truncate">{product.title}</p>
        <p className="text-xs mb-4" style={{ color: mutedColor }}>
          {isFree ? "Free" : formatPrice(product.priceCents, currency)}
          {!isFree && hasDiscount && originalPrice !== null && (
            <span className="ml-2 line-through opacity-60">
              {formatPrice(originalPrice, currency)}
            </span>
          )}
        </p>

        {status === "PAID" ? (
          <div className="flex flex-col items-center gap-3 py-2">
            <CheckCircle2 className="h-10 w-10" style={{ color: "#22c55e" }} />
            <p className="text-sm font-medium">{isRequestType ? "Request received!" : "Payment received!"}</p>
            {isRequestType ? (
              <p className="text-xs text-center" style={{ color: mutedColor }}>
                The seller has been notified and will get back to you at the email you provided.
              </p>
            ) : downloadUrl ? (
              <a
                href={downloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all hover:opacity-90"
                style={{ backgroundColor: accent, color: "#18181b" }}
              >
                Download file
                <ExternalLink className="h-4 w-4" />
              </a>
            ) : (
              <p className="text-xs" style={{ color: mutedColor }}>Check your email for the download link.</p>
            )}
            <button onClick={onClose} className="text-xs underline" style={{ color: mutedColor }}>Close</button>
          </div>
        ) : status === "PENDING" ? (
          <div className="flex flex-col items-center gap-3 py-2">
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: accent }} />
            <p className="text-sm">Waiting for payment…</p>
            <p className="text-xs text-center" style={{ color: mutedColor }}>
              A checkout page was opened in a new tab. Complete the payment there and this dialog will update automatically.
            </p>
            <button onClick={onClose} className="text-xs underline" style={{ color: mutedColor }}>Close</button>
          </div>
        ) : status === "CANCELLED" ? (
          <div className="flex flex-col items-center gap-3 py-2">
            <AlertCircle className="h-8 w-8 text-zinc-500" />
            <p className="text-sm">Purchase was cancelled.</p>
            <button onClick={onClose} className="text-xs underline" style={{ color: mutedColor }}>Close</button>
          </div>
        ) : (
          <>
            {!isFree && methods.length > 1 && (
              <div className="flex gap-1 mb-3 p-0.5 rounded-lg" style={{ backgroundColor: "#27272a" }}>
                {methods.map((m) => (
                  <button
                    key={m}
                    onClick={() => setMethod(m)}
                    className="flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
                    style={{
                      backgroundColor: method === m ? accent : "transparent",
                      color: method === m ? "#18181b" : mutedColor,
                    }}
                  >
                    {m === "STRIPE" ? "Card" : m === "PAYPAL" ? "PayPal" : "Crypto"}
                  </button>
                ))}
              </div>
            )}

            {!isFree && method === "CRYPTO" && coins.length > 0 && (
              <div className="flex gap-1 mb-3 p-0.5 rounded-lg flex-wrap" style={{ backgroundColor: "#27272a" }}>
                {coins.map((c) => (
                  <button
                    key={c}
                    onClick={() => setCoin(c)}
                    className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
                    style={{
                      backgroundColor: coin === c ? accent : "transparent",
                      color: coin === c ? "#18181b" : mutedColor,
                    }}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}

            <input
              type="email"
              placeholder={isRequestType ? "Email (sellers reply here)" : "Email (for download link)"}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm outline-none transition-colors focus:border-violet-500 mb-3"
              style={{ color: textColor }}
            />
            {isRequestType ? (
              <>
                <textarea
                  placeholder="Describe what you need — details, reference links, quantities…"
                  value={requestText}
                  maxLength={2000}
                  rows={4}
                  onChange={(e) => setRequestText(e.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm outline-none transition-colors focus:border-violet-500 mb-3 resize-none"
                  style={{ color: textColor }}
                />
                <p className="text-xs mb-3 -mt-2" style={{ color: mutedColor }}>
                  Your email and request are shared with the seller so they can deliver what you asked for.
                </p>
              </>
            ) : (
              <p className="text-xs mb-3 -mt-2" style={{ color: mutedColor }}>
                Required so we can send you the download link when the payment is confirmed.
              </p>
            )}

            {error && <p className="text-xs mb-2" style={{ color: "#ef4444" }}>{error}</p>}

            <button
              onClick={buy}
              disabled={loading || (isRequestType ? (!email.trim() || !requestText.trim()) : !isFree && !email.trim())}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              style={{ backgroundColor: accent, color: "#18181b" }}
            >
              {isRequestType ? <Send className="h-4 w-4" /> : <ShoppingCart className="h-4 w-4" />}
              {loading ? "Processing…" : isRequestType
                ? (isFree ? "Submit request" : `Pay ${formatPrice(product.priceCents, currency)} and submit`)
                : isFree ? "Get for free" : `Pay ${formatPrice(product.priceCents, currency)}`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function ShopBlock({ products, discountPercent, accent, textColor, mutedColor }: ShopBlockProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [currency, setCurrency] = useState("USD");
  const [availability, setAvailability] = useState<ShopAvailability | null>(null);

  useEffect(() => {
    api.getShopAvailability().then((res) => {
      if (res.success && res.data) {
        setCurrency(res.data.currency);
        setAvailability(res.data);
      }
    }).catch(() => {});
  }, []);

  const effectiveProducts = products.filter((p) => p.id);
  if (effectiveProducts.length === 0) return null;

  const openProduct = effectiveProducts.find((p) => p.id === openId);

  return (
    <div className="mt-4">
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
        {effectiveProducts.map((product) => {
          const hasDiscount = (discountPercent ?? 0) > 0;
          const originalPrice = hasDiscount ? Math.round(product.priceCents * 100 / (100 - (discountPercent ?? 1))) : null;
          return (
            <button
              key={product.id}
              onClick={() => setOpenId(product.id)}
              className="text-left rounded-xl overflow-hidden transition-all duration-200 hover:opacity-90 border"
              style={{ backgroundColor: "#18181b", borderColor: "#27272a" }}
            >
              <div
                className="h-28 w-full bg-cover bg-center"
                style={{
                  backgroundImage: product.previewImage ? `url(${product.previewImage})` : GRADIENT,
                }}
              />
              <div className="p-3">
                <p className="text-sm font-medium truncate" style={{ color: textColor }}>{product.title}</p>
                {product.description && (
                  <p className="text-xs mt-0.5 line-clamp-2" style={{ color: mutedColor }}>{product.description}</p>
                )}
                <p className="text-sm font-semibold mt-2" style={{ color: accent }}>
                  {product.priceCents === 0 ? "Free" : formatPrice(product.priceCents, currency)}
                  {hasDiscount && originalPrice !== null && (
                    <span className="ml-2 text-xs font-normal line-through opacity-60" style={{ color: mutedColor }}>
                      {formatPrice(originalPrice, currency)}
                    </span>
                  )}
                  {product.type === "REQUEST" && (
                    <span className="ml-2 text-xs font-normal" style={{ color: mutedColor }}>
                      · request
                    </span>
                  )}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {openProduct && (
        <BuyDialog
          key={openProduct.id}
          product={openProduct}
          currency={currency}
          discountPercent={discountPercent}
          methods={availableMethods(availability)}
          coins={availability?.coins ?? []}
          accent={accent}
          textColor={textColor}
          mutedColor={mutedColor}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}