import { useCallback, useEffect, useState } from "react";
import { ShoppingCart, Loader2, Download, RefreshCw } from "lucide-react";
import { api, type Purchase } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/ui/dashboard";
import { formatPrice, fileSize } from "@/lib/format";

export function PurchasesTab() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await api.getMyPurchases();
    if (res.success && res.data) setPurchases(res.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const download = async (p: Purchase) => {
    setDownloadingId(p.id);
    setDownloadError("");
    try {
      const { blob, fileName } = await api.downloadPurchase(p.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setDownloadError(e instanceof Error ? e.message : "Download failed.");
    }
    setDownloadingId(null);
  };

  return (
    <div className="space-y-4">
      <SectionCard
        icon={<ShoppingCart className="h-4 w-4" />}
        title="My purchases"
        desc="Download the digital products you bought on this instance."
      >
        <div className="flex items-center gap-2 mb-3">
          {loading && <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />}
          <Button variant="secondary" onClick={() => void load()} disabled={loading}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>

        {downloadError && <p className="text-xs mb-2 text-red-400">{downloadError}</p>}

        {purchases.length === 0 ? (
          <p className="text-sm text-zinc-500 py-6">You haven't purchased anything yet.</p>
        ) : (
          <div className="space-y-2">
            {purchases.map((p) => (
              <div
                key={p.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3.5 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white truncate">{p.title}</p>
                  <p className="text-xs text-zinc-500">
                    {[
                      p.productType === "REQUEST"
                        ? "Request product"
                        : `${p.fileName} · ${fileSize(p.fileSize)}`,
                      p.method === "FREE" ? "Free" : `${formatPrice(p.finalPriceCents, p.currency)}${p.discountPercent > 0 ? ` (-${p.discountPercent}%)` : ""}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {p.productType === "REQUEST" && p.requestText && (
                    <p className="text-xs text-zinc-500 mt-1">{p.requestText}</p>
                  )}
                </div>
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                    p.status === "PAID"
                      ? "bg-emerald-500/10 text-emerald-400"
                      : p.status === "REFUNDED"
                        ? "bg-red-500/10 text-red-400"
                        : p.status === "CANCELLED"
                          ? "bg-zinc-800 text-zinc-400"
                          : "bg-amber-500/10 text-amber-400"
                  }`}
                >
                  {p.status}
                </span>
                <span className="text-xs text-zinc-500">{new Date(p.createdAt).toLocaleDateString()}</span>
                {p.productType === "REQUEST" ? (
                  <span className="text-xs text-zinc-500">Delivered by the seller</span>
                ) : (
                  <Button
                    onClick={() => void download(p)}
                    disabled={downloadingId === p.id || p.status !== "PAID"}
                  >
                    <Download className="h-4 w-4" />
                    {downloadingId === p.id ? "Preparing…" : "Download"}
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}