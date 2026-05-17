/**
 * Prime Studio — "Create new design" dialog.
 *
 * Opened by the "+" button on the project tabs bar (and any other
 * "start a fresh design" entry point). Lets the user pick from a grid
 * of social-media presets or punch in a custom width × height before
 * committing — every choice spawns a brand-new tab with a project of
 * the chosen dimensions.
 *
 * Dialog open/close is exposed through a tiny standalone Zustand store
 * so any part of the studio (toolbars, panels, keyboard shortcuts) can
 * trigger it without prop-drilling.
 */

import { useEffect, useState } from "react";
import { create } from "zustand";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  PRESET_SIZES,
  type PresetSize,
  makeBlankProject,
  openProjectAsNewTab,
} from "./projectFactory";

interface DialogStore {
  open: boolean;
  show: () => void;
  hide: () => void;
}

/**
 * Standalone, dependency-free dialog store. Kept separate from the
 * main `useStudio` store so it can be imported by any consumer
 * without dragging in selector subscriptions.
 */
export const useNewDesignDialog = create<DialogStore>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));

const ACCENT_BG: Record<string, string> = {
  purple: "from-purple-500 to-violet-600",
  pink: "from-pink-500 to-rose-500",
  rose: "from-rose-500 to-red-500",
  fuchsia: "from-fuchsia-500 to-pink-600",
  red: "from-red-500 to-orange-600",
  green: "from-green-500 to-emerald-600",
  emerald: "from-emerald-500 to-teal-600",
  blue: "from-sky-500 to-blue-600",
  slate: "from-slate-700 to-zinc-900",
  indigo: "from-indigo-500 to-blue-700",
  amber: "from-amber-400 to-yellow-600",
  orange: "from-orange-500 to-amber-600",
  stone: "from-stone-400 to-zinc-600",
  violet: "from-violet-500 to-purple-700",
};

function PresetTile({
  preset,
  onPick,
}: {
  preset: PresetSize;
  onPick: () => void;
}) {
  if (preset.label === "Custom size") {
    return (
      <button
        type="button"
        onClick={onPick}
        className="group flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 border-dashed border-purple-300 hover:border-purple-600 hover:bg-purple-50 transition-all text-center"
        data-testid="newdesign-tile-custom"
      >
        <div className="h-14 w-14 rounded-md border border-purple-400 bg-white flex items-center justify-center group-hover:border-purple-600">
          <Plus className="h-6 w-6 text-purple-700" />
        </div>
        <div className="text-[12px] font-semibold text-purple-950 leading-tight">
          {preset.label}
        </div>
        <div className="text-[10px] text-purple-600 leading-tight">{preset.sub}</div>
      </button>
    );
  }
  // Visual chip — proportional preview rectangle so the user can see
  // landscape vs portrait at a glance. Capped to 56 px on the longer
  // edge so very tall stories still render within the tile.
  const longest = Math.max(preset.width, preset.height);
  const previewW = Math.round((preset.width / longest) * 56);
  const previewH = Math.round((preset.height / longest) * 56);
  const accent = ACCENT_BG[preset.accent] || ACCENT_BG.purple;
  return (
    <button
      type="button"
      onClick={onPick}
      className="group flex flex-col items-center gap-1.5 p-3 rounded-lg border border-purple-200 hover:border-purple-500 hover:bg-purple-50 transition-all text-center"
      data-testid={`newdesign-tile-${preset.label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <div className="h-14 w-14 flex items-center justify-center">
        <div
          style={{ width: previewW, height: previewH }}
          className={cn(
            "rounded-sm bg-gradient-to-br shadow-sm border border-white/40",
            accent,
          )}
        />
      </div>
      <div className="text-[12px] font-semibold text-purple-950 leading-tight">
        {preset.label}
      </div>
      <div className="text-[10px] text-purple-600 leading-tight">{preset.sub}</div>
    </button>
  );
}

export function NewDesignDialog() {
  const open = useNewDesignDialog((s) => s.open);
  const hide = useNewDesignDialog((s) => s.hide);

  // Custom-size sub-form lives inline at the top so the user doesn't
  // lose context. Defaults match the most common "social square" size.
  const [showCustom, setShowCustom] = useState(false);
  const [customW, setCustomW] = useState(1080);
  const [customH, setCustomH] = useState(1080);

  // Reset the inline form whenever the dialog re-opens so a previous
  // session's value doesn't surprise the next user.
  useEffect(() => {
    if (open) {
      setShowCustom(false);
      setCustomW(1080);
      setCustomH(1080);
    }
  }, [open]);

  const createWith = (preset: PresetSize) => {
    if (preset.label === "Custom size") {
      setShowCustom(true);
      return;
    }
    const proj = makeBlankProject({
      width: preset.width,
      height: preset.height,
      title: `${preset.label} design`,
    });
    openProjectAsNewTab(proj);
    hide();
  };

  const applyCustom = () => {
    const w = Math.max(50, Math.min(10000, Math.round(customW)));
    const h = Math.max(50, Math.min(10000, Math.round(customH)));
    const proj = makeBlankProject({
      width: w,
      height: h,
      title: `Custom ${w}×${h}`,
    });
    openProjectAsNewTab(proj);
    hide();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : hide())}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto" data-testid="new-design-dialog">
        <DialogHeader>
          <DialogTitle className="text-purple-950">Create a new design</DialogTitle>
          <DialogDescription>
            Pick a ready-made size or set your own — the design opens in a fresh tab.
          </DialogDescription>
        </DialogHeader>

        {showCustom && (
          <div className="rounded-lg border-2 border-purple-300 bg-purple-50 p-4 mb-2">
            <div className="text-sm font-bold text-purple-950 mb-2">Custom size</div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <label className="text-xs font-semibold text-purple-900">
                Width (px)
                <input
                  type="number"
                  min={50}
                  max={10000}
                  value={customW}
                  onChange={(e) => setCustomW(+e.target.value || 0)}
                  className="mt-1 w-full border border-purple-300 rounded px-2 py-1.5 text-sm font-normal"
                  data-testid="newdesign-custom-w"
                />
              </label>
              <label className="text-xs font-semibold text-purple-900">
                Height (px)
                <input
                  type="number"
                  min={50}
                  max={10000}
                  value={customH}
                  onChange={(e) => setCustomH(+e.target.value || 0)}
                  className="mt-1 w-full border border-purple-300 rounded px-2 py-1.5 text-sm font-normal"
                  data-testid="newdesign-custom-h"
                />
              </label>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowCustom(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={applyCustom}
                className="bg-purple-700 hover:bg-purple-800 text-white"
                data-testid="newdesign-custom-apply"
              >
                Create design
              </Button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
          {PRESET_SIZES.map((p) => (
            <PresetTile key={p.label} preset={p} onPick={() => createWith(p)} />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
