import { useState } from "react";
import { Coins, Copy, CheckCircle2, X, ExternalLink } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { api } from "@/lib/api";
import type { TipCoin, TipPaymentResult } from "@/lib/api";

interface TipBlockProps {
  profileId: string;
  heading?: string | null;
  btcAddress?: string | null;
  ltcAddress?: string | null;
  accent: string;
  textColor: string;
  mutedColor: string;
}

const COINS: { id: TipCoin; label: string; color: string }[] = [
  { id: "BTC", label: "Bitcoin", color: "#f7931a" },
  { id: "LTC", label: "Litecoin", color: "#bfbbbb" },
];

const AMOUNTS = ["0.001", "0.005", "0.01", "0.05", "0.1", "0.5"];

export function TipBlock({ profileId, heading, btcAddress, ltcAddress, accent, textColor, mutedColor }: TipBlockProps) {
  const [open, setOpen] = useState(false);
  const [coin, setCoin] = useState<TipCoin>("BTC");
  const [amount, setAmount] = useState("0.01");
  const [customAmount, setCustomAmount] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [payment, setPayment] = useState<TipPaymentResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const activeAddress = coin === "BTC" ? btcAddress : ltcAddress;
  const hasBoth = !!btcAddress && !!ltcAddress;

  const finalAmount = customAmount.trim() || amount;

  const handleTip = async () => {
    if (!activeAddress || sending) return;
    setSending(true);
    setError("");
    setPayment(null);
    const res = await api.createTip({
      profileId,
      coin,
      amount: finalAmount,
      name: name.trim() || undefined,
      message: message.trim() || undefined,
    });
    if (res.success && res.data) {
      setPayment(res.data.payment);
    } else {
      setError(res.error ?? "Something went wrong. Please try again.");
    }
    setSending(false);
  };

  const copyAddress = () => {
    if (!activeAddress) return;
    navigator.clipboard.writeText(activeAddress).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  const reset = () => {
    setOpen(false);
    setPayment(null);
    setAmount("0.01");
    setCustomAmount("");
    setName("");
    setMessage("");
    setError("");
  };

  if (!btcAddress && !ltcAddress) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="mt-4 w-full flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200 hover:opacity-90"
        style={{ backgroundColor: `${accent}22`, color: accent, border: `1px solid ${accent}33` }}
      >
        <Coins className="h-4 w-4" />
        {heading?.trim() || "Send a tip"}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={reset}>
          <div
            className="w-full max-w-sm rounded-2xl p-5 shadow-xl relative"
            style={{ backgroundColor: "#18181b", color: textColor, border: "1px solid #27272a" }}
            onClick={(e) => e.stopPropagation()}
          >
            <button onClick={reset} className="absolute top-3 right-3 opacity-50 hover:opacity-100 transition-opacity" style={{ color: textColor }}>
              <X className="h-5 w-5" />
            </button>

            <p className="text-sm font-semibold mb-3">{heading?.trim() || "Send a tip"}</p>

            {hasBoth && (
              <div className="flex gap-1 mb-3 p-0.5 rounded-lg" style={{ backgroundColor: "#27272a" }}>
                {COINS.filter((c) => (c.id === "BTC" ? btcAddress : ltcAddress)).map((c) => (
                  <button
                    key={c.id}
                    onClick={() => { setCoin(c.id); setPayment(null); setError(""); }}
                    className="flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
                    style={{
                      backgroundColor: coin === c.id ? c.color : "transparent",
                      color: coin === c.id ? "#18181b" : mutedColor,
                    }}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            )}

            <div className="grid grid-cols-3 gap-1.5 mb-3">
              {AMOUNTS.map((a) => (
                <button
                  key={a}
                  onClick={() => { setAmount(a); setCustomAmount(""); setPayment(null); setError(""); }}
                  className="rounded-md px-2 py-1.5 text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: amount === a && !customAmount ? `${accent}22` : "#27272a",
                    color: amount === a && !customAmount ? accent : mutedColor,
                    border: `1px solid ${amount === a && !customAmount ? accent : "transparent"}33`,
                  }}
                >
                  {a}
                </button>
              ))}
              <input
                type="text"
                inputMode="decimal"
                placeholder="Custom"
                value={customAmount}
                onChange={(e) => { setCustomAmount(e.target.value); setPayment(null); setError(""); }}
                className="rounded-md px-2 py-1.5 text-xs font-medium outline-none"
                style={{ backgroundColor: "#27272a", color: textColor, border: `1px solid ${customAmount ? accent : "transparent"}33` }}
              />
            </div>

            <input
              type="text"
              placeholder="Name (optional)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm outline-none transition-colors focus:border-violet-500 mb-2"
              style={{ color: textColor }}
            />
            <textarea
              placeholder="Message (optional)"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={500}
              rows={2}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm outline-none transition-colors focus:border-violet-500 mb-3 resize-none"
              style={{ color: textColor }}
            />

            {error && <p className="text-xs mb-2" style={{ color: "#ef4444" }}>{error}</p>}

            {payment ? (
              <div className="flex flex-col items-center gap-3 py-2">
                {payment.mode === "address" && payment.uri ? (
                  <>
                    <QRCodeSVG value={payment.uri} size={192} bgColor="#18181b" fgColor="#ffffff" level="M" />
                    <div className="flex items-center gap-2 text-xs" style={{ color: mutedColor }}>
                      <span className="break-all max-w-[200px]" style={{ color: textColor }}>{payment.address}</span>
                      <button onClick={copyAddress} className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity" style={{ color: textColor }}>
                        {copied ? <CheckCircle2 className="h-3.5 w-3.5" style={{ color: "#22c55e" }} /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                    <p className="text-xs" style={{ color: mutedColor }}>
                      Scan to send {finalAmount} {coin} or copy the address above
                    </p>
                  </>
                ) : payment.url ? (
                  <a
                    href={payment.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all hover:opacity-90"
                    style={{ backgroundColor: accent, color: "#18181b" }}
                  >
                    Pay with {coin} via BTCPay
                    <ExternalLink className="h-4 w-4" />
                  </a>
                ) : null}
                <button onClick={reset} className="text-xs underline" style={{ color: mutedColor }}>Close</button>
              </div>
            ) : (
              <button
                onClick={handleTip}
                disabled={sending || !activeAddress}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                style={{ backgroundColor: accent, color: "#18181b" }}
              >
                <Coins className="h-4 w-4" />
                {sending ? "Sending…" : `Send ${finalAmount} ${coin}`}
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
