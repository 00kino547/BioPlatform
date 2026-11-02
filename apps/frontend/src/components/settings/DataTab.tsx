import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Download, Upload, FileSpreadsheet, CheckCircle, XCircle, RefreshCw } from "lucide-react";

export function DataTab({ profileId }: { profileId?: string }) {
  // All user-facing strings come from the `dashboard` namespace (data.* keys).
  const { t } = useTranslation("dashboard");
  const [exporting, setExporting] = useState<"xlsx" | "ods" | null>(null);
  const [exportError, setExportError] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: boolean; message: string; warnings: string[] } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const handleExport = async (format: "xlsx" | "ods") => {
    setExporting(format);
    setExportError("");
    setImportResult(null);
    try {
      const blob = await api.exportProfile(format, profileId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `profile-export.${format === "ods" ? "ods" : "xlsx"}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : t("data.exportFailed"));
    } finally {
      setExporting(null);
    }
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    setExportError("");
    try {
      const res = await api.importProfile(file, profileId);
      if (res.success) {
        const applied = res.data?.applied ?? [];
        setImportResult({
          success: true,
          message: t("data.importedFields", { count: applied.length, s: applied.length === 1 ? "" : "s" }),
          warnings: res.data?.warnings ?? res.warnings ?? [],
        });
      } else {
        setImportResult({
          success: false,
          message: res.error ?? t("data.importFailed"),
          warnings: res.warnings ?? [],
        });
      }
    } catch {
      setImportResult({ success: false, message: t("data.importFailedRetry"), warnings: [] });
    } finally {
      setImporting(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3.5">
        <h4 className="text-sm font-medium text-white">{t("data.aboutTitle")}</h4>
        <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
          {t("data.aboutBody")}
        </p>
      </div>

      {exportError && (
        <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
          <XCircle className="h-4 w-4" /> {exportError}
        </div>
      )}

      {importResult && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            importResult.success
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
              : "bg-red-500/10 border-red-500/20 text-red-400"
          }`}
        >
          <div className="flex items-center gap-2">
            {importResult.success ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            {importResult.message}
          </div>
          {importResult.warnings.length > 0 && (
            <div className="mt-2 space-y-1 text-xs opacity-80">
              {importResult.warnings.map((w) => (
                <p key={w}>• {w}</p>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3.5 space-y-4">
        <div className="flex items-center gap-3">
          <FileSpreadsheet className="h-5 w-5 text-violet-400" />
          <div>
            <h4 className="text-sm font-medium text-white">{t("data.exportTitle")}</h4>
            <p className="text-xs text-zinc-500">{t("data.exportDescription")}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => handleExport("xlsx")} disabled={exporting !== null}>
            <Download className="h-4 w-4" />
            {exporting === "xlsx" ? t("data.exporting") : t("data.exportXlsx")}
          </Button>
          <Button variant="secondary" onClick={() => handleExport("ods")} disabled={exporting !== null}>
            <Download className="h-4 w-4" />
            {exporting === "ods" ? t("data.exporting") : t("data.exportOds")}
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3.5 space-y-4">
        <div className="flex items-center gap-3">
          <Upload className="h-5 w-5 text-violet-400" />
          <div>
            <h4 className="text-sm font-medium text-white">{t("data.importTitle")}</h4>
            <p className="text-xs text-zinc-500">{t("data.importDescription")}</p>
          </div>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept=".xlsx,.ods,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.oasis.opendocument.spreadsheet,text/csv,application/csv"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => fileInput.current?.click()} disabled={importing}>
            {importing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {importing ? t("data.importing") : t("data.chooseFile")}
          </Button>
        </div>
      </div>
    </div>
  );
}
