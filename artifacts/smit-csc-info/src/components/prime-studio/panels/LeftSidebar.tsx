/**
 * Vertical icon rail mirroring the Canva-style left dock from the user's
 * reference screenshots: Templates / Elements / Text / Brand / Uploads /
 * Tools / Projects / Apps. Selecting an icon opens its panel; clicking
 * the same icon again closes the panel (gives the canvas full width).
 */

import {
  LayoutTemplate,
  Shapes,
  Type as TypeIcon,
  Brush,
  Palette,
  Upload,
  ImagePlus,
  FolderOpen,
  Grid3x3,
  type LucideIcon,
} from "lucide-react";
import { useStudio, type SidebarTab } from "../store";
import { cn } from "@/lib/utils";

// Tools tab is intentionally NOT in the rail — it is now opened
// contextually via the floating toolbar (Tools button) when an image
// element is selected.
const TABS: { id: SidebarTab; label: string; icon: LucideIcon }[] = [
  { id: "templates", label: "Templates", icon: LayoutTemplate },
  { id: "elements", label: "Elements", icon: Shapes },
  { id: "text", label: "Text", icon: TypeIcon },
  // Artboard sits directly after Text per request — houses the freehand
  // draw, table, and line-tool builders. Brush is the friendliest icon
  // out of {Layout, Brush, Pencil} for "manual canvas tools".
  { id: "artboard", label: "Artboard", icon: Brush },
  { id: "brand", label: "Brand", icon: Palette },
  { id: "uploads", label: "Uploads", icon: Upload },
  { id: "assets", label: "Assets", icon: ImagePlus },
  { id: "projects", label: "Projects", icon: FolderOpen },
  { id: "apps", label: "Apps", icon: Grid3x3 },
];

export function LeftSidebar() {
  const sidebarTab = useStudio((s) => s.sidebarTab);
  const setSidebarTab = useStudio((s) => s.setSidebarTab);

  return (
    <div
      className="w-16 shrink-0 bg-gradient-to-b from-purple-950 via-purple-900 to-indigo-950 text-white flex flex-col items-center py-2 gap-1 border-r border-purple-800/50"
      data-testid="prime-studio-sidebar-rail"
    >
      {TABS.map((t) => {
        const Icon = t.icon;
        const active = sidebarTab === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => setSidebarTab(active ? null : t.id)}
            className={cn(
              "w-full flex flex-col items-center gap-0.5 py-2.5 transition-colors relative",
              active
                ? "bg-white/10 text-amber-300"
                : "text-purple-100 hover:bg-white/5 hover:text-amber-200",
            )}
            title={t.label}
            data-testid={`tab-${t.id}`}
          >
            {active && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 h-8 w-1 rounded-r bg-amber-400" />
            )}
            <Icon className="h-5 w-5" />
            <span className="text-[10px] font-medium leading-none">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}
