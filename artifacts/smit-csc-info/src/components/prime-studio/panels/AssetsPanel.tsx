/**
 * Assets panel — single sidebar entry that hosts the three asset
 * sources (Photos / Graphics / Icons) behind a sub-tab toggle.
 *
 * Important: this is purely a *container*. The three child panels
 * (PhotosPanel / GraphicsPanel / IconsPanel) keep all their existing
 * behaviour — search bars, masonry, colour picker, race-guards, etc.
 * remain inside their own files. This panel only owns:
 *   • a 3-button segmented toggle at the top, and
 *   • the active sub-tab state (kept across mount/unmount of children).
 *
 * Each child panel still mounts/unmounts when switched — that's
 * intentional, so its in-flight aborts and search state reset cleanly
 * (matches the previous per-tab behaviour exactly).
 */

import { useState } from "react";
import { Images, PaintBucket, Sparkles, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { PhotosPanel } from "./PhotosPanel";
import { GraphicsPanel } from "./GraphicsPanel";
import { IconsPanel } from "./IconsPanel";

type AssetSubTab = "photos" | "graphics" | "icons";

const SUB_TABS: { id: AssetSubTab; label: string; icon: LucideIcon }[] = [
  { id: "photos", label: "Photos", icon: Images },
  { id: "graphics", label: "Graphics", icon: PaintBucket },
  { id: "icons", label: "Icons", icon: Sparkles },
];

export function AssetsPanel() {
  const [active, setActive] = useState<AssetSubTab>("photos");

  return (
    <div className="flex flex-col h-full">
      {/* Sub-tab toggle row — sticky at the top so it stays visible
          while the panel below scrolls its own content. */}
      <div className="px-4 pt-4 pb-2 sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-purple-100">
        <div
          className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-purple-50 border border-purple-200"
          role="tablist"
          aria-label="Asset source"
        >
          {SUB_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = active === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActive(tab.id)}
                className={cn(
                  "flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-semibold transition-all",
                  isActive
                    ? "bg-gradient-to-br from-purple-700 to-indigo-700 text-amber-50 shadow-md shadow-purple-300/40"
                    : "text-purple-700 hover:bg-purple-100",
                )}
                data-testid={`assets-subtab-${tab.id}`}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active sub-panel renders below — each one keeps its own
          search bar, content, and pagination. */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {active === "photos" && <PhotosPanel />}
        {active === "graphics" && <GraphicsPanel />}
        {active === "icons" && <IconsPanel />}
      </div>
    </div>
  );
}
