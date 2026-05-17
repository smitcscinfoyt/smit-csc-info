/**
 * Templates panel — common CSC poster sizes (YouTube thumbnail,
 * Instagram post / story, A4 portrait, Visiting card, …).
 *
 * IMPORTANT: selecting a template (or applying a custom size) ALWAYS
 * spawns a brand-new project in a fresh tab — it never resizes the
 * current page. The user explicitly asked for this behaviour because
 * accidentally nuking an in-progress design by clicking a template was
 * an easy footgun.
 */

import { useState } from "react";
import { Plus } from "lucide-react";
import {
  PRESET_SIZES,
  type PresetSize,
  makeBlankProject,
  openProjectAsNewTab,
} from "./projectFactory";

export function TemplatesPanel() {
  const [customOpen, setCustomOpen] = useState(false);
  const [customW, setCustomW] = useState(1280);
  const [customH, setCustomH] = useState(720);

  // The PRESET_SIZES array starts with a sentinel "Custom size" tile we
  // render explicitly above — strip it from the iteration list.
  const templates = PRESET_SIZES.filter((p) => p.label !== "Custom size");

  const apply = (t: PresetSize) => {
    const proj = makeBlankProject({
      width: t.width,
      height: t.height,
      title: `${t.label} design`,
    });
    openProjectAsNewTab(proj);
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
    setCustomOpen(false);
  };

  return (
    <div className="p-4 space-y-3">
      <h3 className="text-base font-bold text-purple-950">Page templates</h3>
      <p className="text-xs text-purple-700">
        Pick a size — your design opens in a new tab.
      </p>

      <div className="space-y-2">
        {/* Custom size — first so it's easy to find */}
        <button
          type="button"
          onClick={() => setCustomOpen((v) => !v)}
          className="w-full flex items-center gap-3 p-3 rounded-lg border-2 border-dashed border-purple-300 hover:border-purple-600 hover:bg-purple-50 text-left transition-all group"
          data-testid="templates-custom-btn"
        >
          <div className="shrink-0 h-11 w-11 rounded-sm border border-purple-400 bg-white flex items-center justify-center">
            <Plus className="h-5 w-5 text-purple-700" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-purple-950">Custom size</div>
            <div className="text-[11px] text-purple-600">Set your own width × height</div>
          </div>
        </button>

        {customOpen && (
          <div className="p-3 rounded-lg bg-purple-50 border border-purple-200 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] font-semibold text-purple-900">
                Width (px)
                <input
                  type="number"
                  min={50}
                  max={10000}
                  value={customW}
                  onChange={(e) => setCustomW(+e.target.value || 0)}
                  className="mt-1 w-full border border-purple-300 rounded px-2 py-1 text-sm font-normal"
                  data-testid="templates-custom-w"
                />
              </label>
              <label className="text-[11px] font-semibold text-purple-900">
                Height (px)
                <input
                  type="number"
                  min={50}
                  max={10000}
                  value={customH}
                  onChange={(e) => setCustomH(+e.target.value || 0)}
                  className="mt-1 w-full border border-purple-300 rounded px-2 py-1 text-sm font-normal"
                  data-testid="templates-custom-h"
                />
              </label>
            </div>
            <button
              type="button"
              onClick={applyCustom}
              className="w-full bg-purple-700 hover:bg-purple-800 text-white text-sm font-semibold py-1.5 rounded"
              data-testid="templates-custom-apply"
            >
              Open in new tab
            </button>
          </div>
        )}

        {templates.map((t) => (
          <button
            key={t.label}
            type="button"
            onClick={() => apply(t)}
            className="w-full flex items-center gap-3 p-3 rounded-lg border border-purple-200 hover:border-purple-500 hover:bg-purple-50 text-left transition-all group"
            data-testid={`templates-tile-${t.label.toLowerCase().replace(/\s+/g, "-")}`}
          >
            <div
              className="shrink-0 rounded-sm border border-purple-300 group-hover:border-purple-500 bg-white"
              style={{
                width: 44,
                height: 44 * (t.height / t.width) || 30,
                maxHeight: 44,
              }}
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-purple-950 truncate">
                {t.label}
              </div>
              <div className="text-[11px] text-purple-600">{t.sub}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
