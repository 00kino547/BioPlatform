export const card =
  "rounded-lg border border-zinc-800/80 bg-zinc-900/40 px-4 py-3.5";

export const cardTitle = "text-sm font-semibold text-white";

export const cardDesc = "mt-0.5 text-xs text-zinc-500";

export const sectionHead = "mb-3 flex items-center gap-2.5";

export const fieldLabel = "mb-1.5 block text-[13px] font-medium text-zinc-300";

export const input =
  "w-full min-w-0 rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-violet-500";

export const textarea = `${input} resize-none`;

export const select =
  "rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500";

export const row =
  "flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3.5 py-2.5";

export const toggleRow = row;

export const iconBtn =
  "text-zinc-500 transition-colors hover:text-violet-400";

export const dangerIconBtn =
  "text-zinc-500 transition-colors hover:text-red-400";

export const emptyState =
  "py-6 text-center text-sm text-zinc-500";

export const errorBox =
  "rounded-lg border border-red-500/20 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-400";

export const infoBox =
  "rounded-lg border border-zinc-800 bg-zinc-900/40 px-3.5 py-2.5 text-xs text-zinc-400";

export const tabBtn = (active: boolean) =>
  `flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-[13px] font-medium transition-colors ${
    active ? "border-b-2 border-violet-400 text-violet-400" : "text-zinc-400 hover:text-white"
  }`;

export const toggle = (on: boolean, onColorClass = "bg-violet-600") =>
  `relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
    on ? onColorClass : "bg-zinc-700"
  }`;

export const toggleKnob = (on: boolean) =>
  `inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
    on ? "translate-x-6" : "translate-x-1"
  }`;