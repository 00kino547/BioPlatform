import { useRef, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Download, Upload, FileSpreadsheet, CheckCircle, XCircle, RefreshCw } from "lucide-react";

export function DataTab({ profileId }: { profileId?: string }) {
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
      setExportError(err instanceof Error ? err.message : "Export failed. Please try again.");
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
          message: `Imported ${applied.length} field${applied.length === 1 ? "" : "s"}.`,
          warnings: res.data?.warnings ?? res.warnings ?? [],
        });
      } else {
        setImportResult({
          success: false,
          message: res.error ?? "Import failed.",
          warnings: res.warnings ?? [],
        });
      }
    } catch {
      setImportResult({ success: false, message: "Import failed. Please try again.", warnings: [] });
    } finally {
      setImporting(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
        <h4 className="text-sm font-medium text-white">About profile transfer</h4>
        <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
          Export your profile as a generic spreadsheet (single sheet, one field per row) that you can
          open anywhere — Excel, LibreOffice, Google Sheets, or Notepad. Imports accept .xlsx, .ods, and
          .csv files. Macro-enabled files (.xlsm, .xls) are rejected. Unknown rows are skipped and listed
          as warnings. Importing replaces your current profile fields.
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

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5 space-y-4">
        <div className="flex items-center gap-3">
          <FileSpreadsheet className="h-5 w-5 text-violet-400" />
          <div>
            <h4 className="text-sm font-medium text-white">Export profile</h4>
            <p className="text-xs text-zinc-500">Download your profile data as a spreadsheet.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => handleExport("xlsx")} disabled={exporting !== null}>
            <Download className="h-4 w-4" />
            {exporting === "xlsx" ? "Exporting..." : "Export .xlsx"}
          </Button>
          <Button variant="secondary" onClick={() => handleExport("ods")} disabled={exporting !== null}>
            <Download className="h-4 w-4" />
            {exporting === "ods" ? "Exporting..." : "Export .ods"}
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5 space-y-4">
        <div className="flex items-center gap-3">
          <Upload className="h-5 w-5 text-violet-400" />
          <div>
            <h4 className="text-sm font-medium text-white">Import profile</h4>
            <p className="text-xs text-zinc-500">Upload a .xlsx, .ods, or .csv file. Macro files are rejected.</p>
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
            {importing ? "Importing..." : "Choose file"}
          </Button>
        </div>
      </div>
    </div>
  );
}
