import { useState } from "react";
import { AlertTriangle, CheckCircle2, CircleDashed, GitBranch } from "lucide-react";
import { useUpdateLockdown } from "@/lib/useVersionCheck";
import { UpdateDialog } from "@/components/updates/UpdateDialog";
import { cn } from "@/lib/utils";

export function VersionBadge() {
  const { data, locked } = useUpdateLockdown();
  const [open, setOpen] = useState(false);

  const severity = data?.severity ?? "none";
  const installed = data?.installed ?? "…";

  let classes = "bg-zinc-800/60 text-zinc-400 hover:text-zinc-200";
  let Icon = CircleDashed;

  if (severity === "critical" || severity === "security") {
    classes = "bg-red-500/10 text-red-300 border border-red-500/30 hover:bg-red-500/20 hover:text-red-200";
    Icon = AlertTriangle;
  } else if (severity === "update") {
    classes = "bg-amber-500/10 text-amber-300 border border-amber-500/30 hover:bg-amber-500/20 hover:text-amber-200";
    Icon = GitBranch;
  } else if (data && data.error && !data.outdated) {
    classes = "bg-zinc-800/60 text-zinc-400 hover:text-zinc-200";
  } else if (data) {
    classes = "bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/20 hover:text-emerald-200";
    Icon = CheckCircle2;
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={locked ? "A critical or security update is available" : "Software version"}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer",
          classes
        )}
      >
        <Icon className="h-3 w-3" />
        v{installed}
      </button>
      <UpdateDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
