import { useCallback, useEffect, useState, useRef, Fragment } from "react";
import { useTranslation } from "react-i18next";
import { ShoppingBag, Loader2, Save, Trash2, Upload, RefreshCw, BadgePercent, ImagePlus } from "lucide-react";
import { api, type Profile, type ShopProduct, type ShopOverview, type Sale } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { SectionCard, Toggle } from "@/components/ui/dashboard";
import { formatPrice, fileSize } from "@/lib/format";
import { formatDate } from "@/lib/intl";

interface ShopTabProps {
  profile: Profile | null;
  onProfileChange: (patch: Partial<Profile>) => void;
}

const inputClass =
  "w-full rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-violet-500";

const DEFAULTS: Record<string, string> = {
  title: "",
  description: "",
  priceCents: "0",
  type: "DOWNLOAD",
  file: "",
  preview: "",
};

export function ShopTab({ profile, onProfileChange }: ShopTabProps) {
  const { t } = useTranslation("profile");
  const profileId = profile?.id;
  const [overview, setOverview] = useState<ShopOverview | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(false);

  const [discount, setDiscount] = useState(profile?.shopDiscountPercent ?? 0);
  const [discountSaving, setDiscountSaving] = useState(false);
  const [discountSaved, setDiscountSaved] = useState(false);
  const [discountError, setDiscountError] = useState("");

  const [form, setForm] = useState(DEFAULTS);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const previewInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = useCallback(async () => {
    if (!profileId) return;
    setLoading(true);
    const [ovRes, salesRes] = await Promise.all([
      api.getShopOverview(profileId),
      api.getSales(profileId),
    ]);
    if (ovRes.success && ovRes.data) setOverview(ovRes.data);
    if (salesRes.success && salesRes.data) setSales(salesRes.data);
    setLoading(false);
  }, [profileId]);

  useEffect(() => {
    setDiscount(profile?.shopDiscountPercent ?? 0);
    if (profileId) void load();
  }, [profile?.id, profile?.shopDiscountPercent, profileId, load]);

  const saveDiscount = async () => {
    if (!profileId) return;
    setDiscountSaving(true);
    setDiscountError("");
    const v = Math.max(0, Math.min(100, Math.round(discount || 0)));
    const res = await api.updateProfile({ shopDiscountPercent: v }, profileId);
    setDiscountSaving(false);
    if (!res.success || !res.data) {
      setDiscountError(res.error ?? t("shopTab.saveDiscountError"));
      return;
    }
    onProfileChange({ shopDiscountPercent: res.data.shopDiscountPercent ?? null });
    setDiscountSaved(true);
    setTimeout(() => setDiscountSaved(false), 2000);
  };

  const createProduct = async () => {
    if (!profileId || (form.type !== "REQUEST" && !form.file)) return;
    setCreating(true);
    setCreateError("");
    const res = await api.createProduct(
      {
        file: form.file ? (form.file as unknown as File) : undefined,
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        priceCents: Math.max(0, Math.round(Number(form.priceCents) || 0)),
        type: form.type === "REQUEST" ? "REQUEST" : "DOWNLOAD",
      },
      profileId,
    );
    setCreating(false);
    if (!res.success) {
      setCreateError(res.error ?? t("shopTab.createError"));
      return;
    }
    setForm(DEFAULTS);
    if (fileInput.current) fileInput.current.value = "";
    void load();
  };

  const toggleProduct = async (p: ShopProduct) => {
    await api.updateProduct(p.id, { enabled: !p.enabled });
    void load();
  };

  const removeProduct = async (p: ShopProduct) => {
    if (!confirm(t(p.type === "DOWNLOAD" ? "shopTab.deleteConfirmDownload" : "shopTab.deleteConfirmRequest", { title: p.title }))) return;
    await api.deleteProduct(p.id);
    void load();
  };

  const uploadPreview = async (p: ShopProduct, image: File) => {
    await api.uploadProductPreview(p.id, image);
    void load();
  };

  if (!profileId) {
    return <p className="text-sm text-zinc-500 text-center py-12">{t("shopTab.selectProfile")}</p>;
  }

  const limitText = overview?.limit == null ? t("shopTab.unlimited") : t("shopTab.productsCount", { used: (overview?.products ?? []).length, limit: overview.limit });

  return (
    <div className="space-y-4">
      <SectionCard
        icon={<ShoppingBag className="h-4 w-4" />}
        title={t("shopTab.productShop")}
        desc={t("shopTab.productShopDesc")}
      >
        {overview && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 mb-4">
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2">
              <p className="text-xs text-zinc-500">{t("shopTab.planLimit")}</p>
              <p className="text-sm font-semibold text-white">{limitText}</p>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2">
              <p className="text-xs text-zinc-500">{t("shopTab.discount")}</p>
              <p className="text-sm font-semibold text-white">{overview.discountPercent}{t("shopTab.percent")}</p>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2">
              <p className="text-xs text-zinc-500">{t("shopTab.sales")}</p>
              <p className="text-sm font-semibold text-white">{overview.totalSold}</p>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2">
              <p className="text-xs text-zinc-500">{t("shopTab.revenue")}</p>
              <p className="text-sm font-semibold text-white">{formatPrice(overview.revenueCents, overview.currency)}</p>
            </div>
          </div>
        )}

        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3.5 mb-4">
          <div className="flex items-center gap-2.5 mb-2">
            <BadgePercent className="h-4 w-4 text-violet-400" />
            <h4 className="text-sm font-medium text-white">{t("shopTab.profileDiscount")}</h4>
          </div>
          <p className="text-xs text-zinc-500 mb-2">
            {t("shopTab.profileDiscountDesc")}
          </p>
          <div className="flex flex-wrap items-center gap-2.5">
            <input
              type="number"
              min={0}
              max={100}
              value={discount}
              onChange={(e) => {
                setDiscount(Number(e.target.value));
                setDiscountSaved(false);
                setDiscountError("");
              }}
              className={inputClass}
              style={{ width: "7rem" }}
            />
            <span className="text-sm text-zinc-400">{t("shopTab.percent")}</span>
            <Button onClick={saveDiscount} disabled={discountSaving}>
              <Save className="h-4 w-4" />
              {discountSaving ? t("shopTab.saving") : discountSaved ? t("shopTab.saved") : t("shopTab.saveDiscount")}
            </Button>
          </div>
          {discountError && <p className="text-xs mt-2 text-red-400">{discountError}</p>}
        </div>

        <div className="flex items-center gap-2 mb-3">
          <h4 className="text-sm font-medium text-white">{t("shopTab.addProduct")}</h4>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />}
        </div>
        <div className="flex gap-1 p-0.5 rounded-lg bg-zinc-900 mb-3 max-w-xs" style={{ border: "1px solid #27272a" }}>
          {(["DOWNLOAD", "REQUEST"] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setForm({ ...form, type })}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                form.type === type ? "bg-violet-500/25 text-violet-300" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {type === "DOWNLOAD" ? t("shopTab.downloadFile") : t("shopTab.requestWork")}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {form.type === "REQUEST" ? (
            <div className="sm:col-span-2 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3.5 py-3">
              <p className="text-sm text-zinc-300">{t("shopTab.requestTypeProduct")}</p>
              <p className="text-xs text-zinc-500 mt-1">
                {t("shopTab.requestTypeDesc")}
              </p>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">{t("shopTab.deliverableFile")}</label>
              <input
                ref={fileInput as React.Ref<HTMLInputElement>}
                type="file"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setForm({ ...form, file: f as unknown as string });
                }}
                className="block w-full text-sm text-zinc-400 file:mr-3 file:rounded-lg file:border-0 file:bg-violet-500/20 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-violet-300 hover:file:bg-violet-500/30"
              />
              <p className="text-xs text-zinc-500 mt-1">{t("shopTab.deliverableFileHelp")}</p>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">{t("shopTab.previewImage")}</label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setForm({ ...form, preview: f as unknown as string });
              }}
              className="block w-full text-sm text-zinc-400 file:mr-3 file:rounded-lg file:border-0 file:bg-violet-500/20 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-violet-300 hover:file:bg-violet-500/30"
            />
            <p className="text-xs text-zinc-500 mt-1">{t("shopTab.previewImageHelp")}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">{t("shopTab.title")}</label>
            <input
              value={form.title}
              maxLength={80}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder={t("shopTab.titlePlaceholder")}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              {t("shopTab.price", { currency: overview?.currency ?? "USD" })}
            </label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={form.priceCents}
              onChange={(e) => setForm({ ...form, priceCents: e.target.value })}
              placeholder={t("shopTab.pricePlaceholder")}
              className={inputClass}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">{t("shopTab.description")}</label>
            <textarea
              value={form.description}
              maxLength={500}
              rows={2}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder={t("shopTab.descriptionPlaceholder")}
              className={`${inputClass} resize-none`}
            />
          </div>
        </div>
        {createError && <p className="text-xs mt-2 text-red-400">{createError}</p>}
        <div className="mt-3">
          <Button onClick={createProduct} disabled={creating || !form.title.trim() || (form.type !== "REQUEST" && !form.file)}>
            <Upload className="h-4 w-4" />
            {creating ? t("shopTab.uploading") : t("shopTab.createProduct")}
          </Button>
        </div>
      </SectionCard>

      <SectionCard
        icon={<RefreshCw className="h-4 w-4" />}
        title={t("shopTab.products")}
        desc={t("shopTab.productsDesc")}
      >
        {overview && overview.products.length === 0 ? (
          <p className="text-sm text-zinc-500 py-4">{t("shopTab.noProducts")}</p>
        ) : (
          <div className="space-y-2">
            {overview?.products.map((p) => (
              <div
                key={p.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3.5 py-2.5"
              >
                <div
                  className="h-10 w-14 shrink-0 rounded-md bg-cover bg-center"
                  style={{
                    backgroundImage: p.previewImage
                      ? `url(${p.previewImage})`
                      : "linear-gradient(135deg, #8b5cf6, #3b82f6)",
                  }}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white truncate">{p.title}</p>
                  <p className="text-xs text-zinc-500">
                    {p.type === "REQUEST" ? t("shopTab.requestPrefix") : ""}
                    {p.fileName ? `${p.fileName} · ${fileSize(p.fileSize)} · ` : ""}
                    {p.priceCents === 0 ? t("shopTab.free") : formatPrice(p.priceCents, overview.currency)}{" "}
                    {discount > 0 && p.priceCents > 0 && (
                      <span className="line-through opacity-60">{formatPrice(Math.round(p.priceCents * 100 / (100 - discount)), overview.currency)}</span>
                    )}
                    {p.purchases ? ` · ${t("shopTab.soldCount", { count: p.purchases })}` : ""}
                  </p>
                </div>
                <Toggle on={p.enabled} onChange={() => toggleProduct(p)} />
                <input
                  ref={(el) => { previewInputs.current[p.id] = el; }}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadPreview(p, f);
                    e.target.value = "";
                  }}
                />
                <button
                  onClick={() => previewInputs.current[p.id]?.click()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-2.5 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:border-violet-500"
                >
                  <ImagePlus className="h-3.5 w-3.5" />
                  {t("shopTab.previewButton")}
                </button>
                <button
                  onClick={() => removeProduct(p)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 px-2.5 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t("shopTab.deleteButton")}
                </button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        icon={<BadgePercent className="h-4 w-4" />}
        title={t("shopTab.recentSales")}
        desc={t("shopTab.recentSalesDesc")}
      >
        {sales.length === 0 ? (
          <p className="text-sm text-zinc-500 py-4">{t("shopTab.noSales")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-zinc-500 border-b border-zinc-800">
                  <th className="py-2 pr-3 font-medium">{t("shopTab.tableProduct")}</th>
                  <th className="py-2 pr-3 font-medium">{t("shopTab.tableBuyer")}</th>
                  <th className="py-2 pr-3 font-medium">{t("shopTab.tableMethod")}</th>
                  <th className="py-2 pr-3 font-medium">{t("shopTab.tableStatus")}</th>
                  <th className="py-2 pr-3 font-medium">{t("shopTab.tableAmount")}</th>
                  <th className="py-2 font-medium">{t("shopTab.tableDate")}</th>
                </tr>
              </thead>
              <tbody>
                  {sales.map((s) => (
                    <Fragment key={s.id}>
                      <tr className="border-b border-zinc-800/60">
                        <td className="py-2 pr-3 text-white">{s.product.title}</td>
                        <td className="py-2 pr-3 text-zinc-400">{s.buyerEmail ?? (s.isGuest ? t("shopTab.guest") : t("shopTab.account"))}</td>
                        <td className="py-2 pr-3 text-zinc-400">{s.method === "FREE" ? t("shopTab.methodFree") : s.method === "CRYPTO" ? `${s.cryptoCoin ?? t("shopTab.crypto")}` : s.method}</td>
                        <td className="py-2 pr-3">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                              s.status === "PAID"
                                ? "bg-emerald-500/10 text-emerald-400"
                                : s.status === "REFUNDED"
                                  ? "bg-red-500/10 text-red-400"
                                  : "bg-zinc-800 text-zinc-400"
                            }`}
                          >
                            {s.status}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-zinc-300">
                          {s.method === "FREE" ? t("shopTab.dash") : `${formatPrice(s.finalPriceCents, s.currency)}${s.discountPercent > 0 ? t("shopTab.discountSuffix", { percent: s.discountPercent }) : ""}`}
                        </td>
                        <td className="py-2 text-zinc-500">{formatDate(s.createdAt)}</td>
                      </tr>
                      {s.product.type === "REQUEST" && s.requestText && (
                        <tr className="border-b border-zinc-800/60">
                          <td colSpan={6} className="py-2 pr-3 pl-6 text-xs text-zinc-500">
                            <span className="text-zinc-400">{t("shopTab.requestLabel")}</span> {s.requestText}
                          </td>
                        </tr>
                      )}
</Fragment>
                  ))}
                </tbody>
              </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}