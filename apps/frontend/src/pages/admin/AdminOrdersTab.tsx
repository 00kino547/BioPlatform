import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Check, Ban, RotateCcw, CreditCard } from "lucide-react";
import { api, type AdminOrderListItem } from "@/lib/api";
import { ManualPaymentInstructionsEditor } from "@/components/settings/ManualPaymentInstructionsEditor";

const PAGE_SIZE = 10;

function money(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "Pending", cls: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  PAID: { label: "Paid", cls: "bg-green-500/10 text-green-400 border-green-500/20" },
  CANCELLED: { label: "Cancelled", cls: "bg-red-500/10 text-red-400 border-red-500/20" },
  REFUNDED: { label: "Refunded", cls: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20" },
};

export function AdminOrdersTab() {
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
        setError(res.error ?? "Could not load orders");
      }
    } catch {
      setError("Could not load orders");
    }
    setLoading(false);
  }, [statusFilter]);

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
        setError(res.error ?? "Could not update the order");
      }
    } catch {
      setError("Could not update the order");
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
            <h3 className="text-sm font-medium text-white">Orders ({total})</h3>
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
              <option value="">All statuses</option>
              <option value="PENDING">Pending</option>
              <option value="PAID">Paid</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="REFUNDED">Refunded</option>
            </select>
            <button onClick={() => load(offset, statusFilter)} className="text-xs text-zinc-400 hover:text-white transition-colors flex items-center gap-1">
              <RefreshCw className="h-3 w-3" /> Refresh
            </button>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-zinc-500 text-center py-10">Loading orders…</p>
        ) : orders.length === 0 ? (
          <p className="text-sm text-zinc-500 text-center py-10">No orders yet.</p>
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
                    <p className="text-xs text-zinc-500">Created {fmtDate(o.createdAt)}</p>
                  </div>
                  <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_META[o.status]?.cls ?? ""}`}>
                    {STATUS_META[o.status]?.label ?? o.status}
                  </span>
                  <div className="flex items-center gap-2">
                    {o.status === "PENDING" && (
                      <>
                        <button
                          onClick={() => changeStatus(o.id, "PAID")}
                          title="Mark paid (upgrades the user's tier)"
                          className="inline-flex items-center gap-1 rounded-lg bg-green-600/90 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-500 transition-colors"
                        >
                          <Check className="h-3 w-3" /> Mark paid
                        </button>
                        <button
                          onClick={() => changeStatus(o.id, "CANCELLED")}
                          title="Cancel the order"
                          className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:border-red-500/40 hover:text-red-400 transition-colors"
                        >
                          <Ban className="h-3 w-3" /> Cancel
                        </button>
                      </>
                    )}
                    {o.status === "PAID" && (
                      <button
                        onClick={() => changeStatus(o.id, "REFUNDED")}
                        title="Refund the order"
                        className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:border-amber-500/40 hover:text-amber-400 transition-colors"
                      >
                        <RotateCcw className="h-3 w-3" /> Refund
                      </button>
                    )}
                  </div>
                </div>
                {o.adminNote && <p className="mt-1 text-xs text-zinc-500 italic">Note: {o.adminNote}</p>}
                {o.paidAt && <p className="mt-1 text-xs text-zinc-500">Paid {fmtDate(o.paidAt)}</p>}
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
              Previous
            </button>
            <span className="text-xs text-zinc-500">
              {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
            </span>
            <button
              onClick={() => load(offset + PAGE_SIZE, statusFilter)}
              disabled={offset + PAGE_SIZE >= total}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:border-violet-500/40 disabled:opacity-40 transition-colors"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}