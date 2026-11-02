import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { usePageMeta } from "@/lib/seo";
import { branding } from "@/config/branding";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/intl";
import { Check, Copy, Loader2, Mail, TriangleAlert } from "lucide-react";

// Guest claim page: shows the codes for a purchase made before registering.
//
// Access is by a token that was emailed to the buyer and is scoped to this one
// order, so this page is safe to link to from an email and needs no account. The
// token is verified server-side before anything is revealed — the frontend never
// decides what a visitor may see.

type PurchaseCodes = {
  id: string;
  quantity: number;
  priceCents: number;
  currency: string;
  status: "PENDING" | "PAID" | "REFUNDED" | "CANCELLED";
  createdAt: string;
  codes: Array<{ code: string; used: boolean; revoked: boolean }>;
};

function money(cents: number, currency: string): string {
  try {
    return formatCurrency(cents, currency);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

export function InvitePurchaseStatus() {
  const { t } = useTranslation("invite");
  const { orderId = "" } = useParams();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";

  const [data, setData] = useState<PurchaseCodes | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  usePageMeta({
    title: t("invitePurchaseStatus.metaTitle", { name: branding.name }),
    description: t("invitePurchaseStatus.metaDescription"),
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const res = await api.getInvitePurchaseStatus(orderId, token);
    if (res.success && res.data) {
      setData(res.data as PurchaseCodes);
    } else {
      setError(res.error ?? t("invitePurchaseStatus.errorDefault"));
    }
    setLoading(false);
  }, [orderId, token, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const copy = async (code: string) => {
    await navigator.clipboard.writeText(code);
    setCopied(code);
    window.setTimeout(() => setCopied(null), 2000);
  };

  const resend = async () => {
    const res = await api.resendInviteClaimLink(orderId);
    setResent(res.success);
  };

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-24 text-center">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-zinc-500" aria-hidden />
        <p className="mt-3 text-sm text-zinc-500" role="status">
          {t("invitePurchaseStatus.loading")}
        </p>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-24 text-center">
        <TriangleAlert className="mx-auto h-6 w-6 text-amber-400" aria-hidden />
        <h1 className="mt-4 text-xl font-semibold text-white">{t("invitePurchaseStatus.invalidTitle")}</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-zinc-400">{error}</p>
        <p className="mt-4 text-sm text-zinc-500">
          {t("invitePurchaseStatus.invalidHint")}
        </p>
      </main>
    );
  }

  const live = data.codes.filter((c) => !c.used && !c.revoked);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-16 sm:px-6 sm:py-24">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">{t("invitePurchaseStatus.heading")}</h1>
        <p className="mt-2 text-sm text-zinc-400">
          {t("invitePurchaseStatus.summary", {
            count: data.quantity,
            plural: data.quantity === 1 ? "" : "s",
            price: money(data.priceCents, data.currency),
            status: data.status === "PAID" ? t("invitePurchaseStatus.paid") : data.status.toLowerCase(),
          })}
        </p>
      </header>

      {data.status !== "PAID" ? (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-6">
          <p className="text-sm text-amber-200">
            {t("invitePurchaseStatus.orderNotPaid", { status: data.status.toLowerCase() })}
          </p>
        </div>
      ) : (
        <>
          <ol className="space-y-2">
            {data.codes.map((code) => {
              const done = code.used || code.revoked;
              return (
                <li
                  key={code.code}
                  className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
                    done
                      ? "border-zinc-800/60 bg-zinc-900/20 opacity-60"
                      : "border-zinc-800 bg-zinc-900/40"
                  }`}
                >
                  <span className="font-mono text-sm text-zinc-300">{code.code}</span>
                  <span className="flex items-center gap-3">
                    {code.used ? (
                      <span className="text-xs text-zinc-500">{t("invitePurchaseStatus.used")}</span>
                    ) : code.revoked ? (
                      <span className="text-xs text-red-400">{t("invitePurchaseStatus.revoked")}</span>
                    ) : (
                      <>
                        <span className="text-xs text-emerald-400">{t("invitePurchaseStatus.available")}</span>
                        <button
                          type="button"
                          onClick={() => copy(code.code)}
                          aria-label={t("invitePurchaseStatus.copyAria", { code: code.code })}
                          className="text-violet-400 transition-colors hover:text-violet-300"
                        >
                          {copied === code.code ? (
                            <Check className="h-4 w-4" aria-hidden />
                          ) : (
                            <Copy className="h-4 w-4" aria-hidden />
                          )}
                        </button>
                      </>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>

          <div className="mt-6 rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-6">
            <p className="text-sm text-zinc-300">
              {t("invitePurchaseStatus.useOneCode")}{" "}
              <a href="/register" className="text-violet-400 hover:text-violet-300">
                {t("invitePurchaseStatus.register")}
              </a>
              . {t("invitePurchaseStatus.remainingCodes", { count: Math.max(0, live.length - 1) })}
            </p>
          </div>
        </>
      )}

      <div className="mt-8 text-center">
        <button
          type="button"
          onClick={resend}
          className="inline-flex items-center gap-2 text-xs text-zinc-500 transition-colors hover:text-zinc-300"
        >
          <Mail className="h-3.5 w-3.5" aria-hidden />
          {resent ? t("invitePurchaseStatus.resendSent") : t("invitePurchaseStatus.resend")}
        </button>
      </div>
    </main>
  );
}