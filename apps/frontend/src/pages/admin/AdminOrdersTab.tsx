import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw, Check, Ban, RotateCcw, CreditCard } from "lucide-react";
import { api, type AdminOrderListItem } from "@/lib/api";
import { formatCurrency, formatDateTime } from "@/lib/intl";
import { ManualPaymentInstructionsEditor } from "@/components/settings/ManualPaymentInstructionsEditor";

const PAGE_SIZE = 10;

function money(cents: number, currency: string): string {
  try {
    return formatCurrency(cents, currency);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return formatDateTime(iso);
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "common:status.pending", cls: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  PAID: { label: "common:status.paid", cls: "bg-green-500/10 text-green-400 border-green-500/20" },
  CANCELLED: { label: "common:status.cancelled", cls: "bg-red-500/10 text-red-400 border-red-500/20" },
  REFUNDED: { label: "common:status.refunded", cls: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20" },
};

export function AdminOrdersTab() {
  // Admin tab listing paid/manual orders for the operator.
  const { t } = useTranslation("admin");
  const [orders, setOrders] = useState<AdminOrderListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");


  const load = useCallback(async (pageOffset = 0, filter = statusFilter) => {
    setLoading(true);
    try {
      const res = await api.getAdminOrders({ status: filter || undefined, limit: PAGE_SIZE, offset: pageOffset });
      if (res.success && Array.isArray(res.data)) {
        setOrders(res.data);
        setTotal(res.meta?.total ?? 0);
        setOffset(pageOffset);
      } else {
        setError(res.error ?? t("admin.orders.loadFailed"));
      }
    } catch {
      setError(t("admin.orders.loadFailed"));
    }
    setLoading(false);
  }, [statusFilter, t]);

  useEffect(() => {
    load();
  }, [load]);

  const changeStatus = async (id: string, status: "PENDING" | "PAID" | "CANCELLED" | "REFUNDED") => {
    setError("");
    try {
      const res = await api.updateAdminOrder(id, { status });
      if (res.success && res.data) {
        await load(offset, statusFilter);
      } else {
        setError(res.error ?? t("admin.orders.updateFailed"));
      }
    } catch {
      setError(t("admin.orders.updateFailed"));
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>
      )}

      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-6">
        <ManualPaymentInstructionsEditor />
      </div>


      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-violet-400" />
            <h3 className="text-sm font-medium text-white">{t("admin.orders.heading", { count: total })}</h3>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                load(0, e.target.value);
              }}
              className="rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              <option value="">{t("admin.orders.filterAll")}</option>
              <option value="PENDING">{t("common:status.pending")}</option>
              <option value="PAID">{t("common:status.paid")}</option>
              <option value="CANCELLED">{t("common:status.cancelled")}</option>
              <option value="REFUNDED">{t("common:status.refunded")}</option>
            </select>
            <button onClick={() => load(offset, statusFilter)} className="text-xs text-zinc-400 hover:text-white transition-colors flex items-center gap-1">
              <RefreshCw className="h-3 w-3" /> {t("admin.orders.refresh")}
            </button>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-zinc-500 text-center py-10">{t("admin.orders.loading")}</p>
        ) : orders.length === 0 ? (
          <p className="text-sm text-zinc-500 text-center py-10">{t("admin.orders.empty")}</p>
        ) : (
          <div className="space-y-2">
            {orders.map((o) => (
              <div key={o.id} className="rounded-lg border border-zinc-800 px-4 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white">
                      {o.user.username}{" "}
                      <span className="text-xs text-zinc-500">({o.user.tier.toLowerCase()})</span>
                    </p>
                    <p className="text-xs text-zinc-500">{o.user.email}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-white">
                      {o.planLabel} · {money(o.finalPriceCents, o.currency)}
                      {o.discountPercent > 0 ? ` (-${o.discountPercent}%)` : ""}
                    </p>
                    <p className="text-xs text-zinc-500">{t("admin.orders.created", { date: fmtDate(o.createdAt) })}</p>
                  </div>
                  <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_META[o.status]?.cls ?? ""}`}>
                    {STATUS_META[o.status] ? t(STATUS_META[o.status].label) : o.status}
                  </span>
                  <div className="flex items-center gap-2">
                    {o.status === "PENDING" && (
                      <>
                        <button
                          onClick={() => changeStatus(o.id, "PAID")}
                          title={t("admin.orders.markPaidTitle")}
                          className="inline-flex items-center gap-1 rounded-lg bg-green-600/90 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-500 transition-colors"
                        >
                          <Check className="h-3 w-3" /> {t("admin.orders.markPaid")}
                        </button>
                        <button
                          onClick={() => changeStatus(o.id, "CANCELLED")}
                          title={t("admin.orders.cancelTitle")}
                          className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:border-red-500/40 hover:text-red-400 transition-colors"
                        >
                          <Ban className="h-3 w-3" /> {t("admin.orders.cancel")}
                        </button>
                      </>
                    )}
                    {o.status === "PAID" && (
                      <button
                        onClick={() => {
                          const confirmed = window.confirm(t("admin.orders.refundConfirm"));
                          if (confirmed) void changeStatus(o.id, "REFUNDED");
                        }}
                        title={t("admin.orders.refundTitle")}
                        className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:border-amber-500/40 hover:text-amber-400 transition-colors"
                      >
                        <RotateCcw className="h-3 w-3" /> {t("admin.orders.refund")}
                      </button>
                    )}
                  </div>
                </div>
                {o.adminNote && <p className="mt-1 text-xs text-zinc-500 italic">{t("admin.orders.note", { note: o.adminNote })}</p>}
                {o.paidAt && <p className="mt-1 text-xs text-zinc-500">{t("admin.orders.paid", { date: fmtDate(o.paidAt) })}</p>}
              </div>
            ))}
          </div>
        )}

        {total > PAGE_SIZE && (
          <div className="mt-4 flex items-center justify-between">
            <button
              onClick={() => load(Math.max(0, offset - PAGE_SIZE), statusFilter)}
              disabled={offset === 0}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:border-violet-500/40 disabled:opacity-40 transition-colors"
            >
              {t("admin.pagination.previous")}
            </button>
            <span className="text-xs text-zinc-500">
              {t("admin.orders.range", { from: offset + 1, to: Math.min(offset + PAGE_SIZE, total), total })}
            </span>
            <button
              onClick={() => load(offset + PAGE_SIZE, statusFilter)}
              disabled={offset + PAGE_SIZE >= total}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:border-violet-500/40 disabled:opacity-40 transition-colors"
            >
              {t("admin.pagination.next")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
