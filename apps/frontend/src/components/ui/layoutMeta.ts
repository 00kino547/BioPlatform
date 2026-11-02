import { AlignCenter, Camera, Columns3, GalleryVerticalEnd, LayoutGrid, LayoutList, Minimize2, PanelLeft, PanelTop, Rows3, Sparkles, SquareDashedBottom, SquareTerminal } from "lucide-react";
import type { LayoutName } from "@/lib/api";

// Keep the catalogue separate from the rendered selector. The landing showcase
// reads the same metadata, but it must not pull a React component module into
// Fast Refresh's component-only export boundary.
export const LAYOUT_META: { id: LayoutName; label: string; hint: string; icon: typeof LayoutGrid }[] = [
  { id: "default", label: "Default", hint: "Simple centered card", icon: LayoutGrid },
  { id: "grid", label: "Grid", hint: "2-column icon tiles", icon: Columns3 },
  { id: "compact", label: "Compact", hint: "Tight single-column", icon: Minimize2 },
  { id: "wide", label: "Wide", hint: "Full-width 3 columns", icon: Rows3 },
  { id: "glassmorphism", label: "Glass", hint: "Frosted glass card", icon: Sparkles },
  { id: "minimal", label: "Minimal", hint: "Clean, borderless", icon: AlignCenter },
  { id: "sidebar", label: "Sidebar", hint: "Avatar beside content", icon: PanelLeft },
  { id: "editorial", label: "Editorial", hint: "Masthead + hairlines", icon: LayoutList },
  { id: "hero", label: "Hero", hint: "Big centered hero", icon: GalleryVerticalEnd },
  { id: "bento", label: "Bento", hint: "Mixed-size tiles", icon: SquareDashedBottom },
  { id: "terminal", label: "Terminal", hint: "Hacker monospace card", icon: SquareTerminal },
  { id: "polaroid", label: "Polaroid", hint: "Tilted photo frame", icon: Camera },
  { id: "topbar", label: "Topbar", hint: "Horizontal nav header", icon: PanelTop },
];
