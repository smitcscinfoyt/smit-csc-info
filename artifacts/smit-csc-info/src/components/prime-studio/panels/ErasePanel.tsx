/**
 * Floating "Erase" panel that appears on the RIGHT edge of the canvas
 * whenever `eraseMode` is active. Gives the user a prominent place to
 * pick brush size — a slider, a live brush-size preview circle, and
 * a row of preset chips (Small / Medium / Large / XL). The mini brush
 * slider in the top contextual toolbar still works; this panel just
 * makes the brush controls big and obvious so the user can fine-tune
 * the brush without hunting in the toolbar.
 *
 * Mounted unconditionally by `prime-studio.tsx` and self-hides when
 * eraseMode is null.
 */

import { Eraser } from "lucide-react";
import { useStudio } from "../store";

const PRESETS: { label: string; value: number }[] = [
  { label: "Small", value: 16 },
  { label: "Medium", value: 48 },
  { label: "Large", value: 96 },
  { label: "XL", value: 160 },
];

const MIN_BRUSH = 6;
const MAX_BRUSH = 200;
// Visual circle inside the preview box scales linearly between MIN and
// MAX. Box is 96px wide so the largest brush fills ~80% of the box.
const PREVIEW_BOX_PX = 96;
const PREVIEW_MAX_PX = 80;

export function ErasePanel() {
  const eraseMode = useStudio((s) => s.eraseMode);
  const eraseBrushSize = useStudio((s) => s.eraseBrushSize);
  const setEraseBrushSize = useStudio((s) => s.setEraseBrushSize);

  if (!eraseMode) return null;

  // Map brush size (6..200 px in design space) to a visible circle
  // diameter inside the 96px preview box.
  const previewDiameter =
    PREVIEW_MAX_PX *
    ((eraseBrushSize - MIN_BRUSH) / (MAX_BRUSH - MIN_BRUSH));
  const safePreviewDiameter = Math.max(6, Math.min(PREVIEW_MAX_PX, previewDiameter));

  return (
    <div
      className="absolute top-20 right-4 z-30 w-60 bg-white/95 backdrop-blur rounded-xl shadow-xl ring-1 ring-purple-200 p-4 pointer-events-auto"
      data-testid="panel-erase"
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="p-1.5 rounded-md bg-purple-100">
          <Eraser className="h-4 w-4 text-purple-700" />
        </div>
        <div>
          <div className="text-sm font-bold text-purple-950">Eraser</div>
          <div className="text-[10px] text-purple-600">
            Paint over pixels to remove
          </div>
        </div>
      </div>

      {/* Live brush-size preview — a translucent purple circle that
          scales with the slider so the user can see the actual size. */}
      <div
        className="mx-auto mb-3 flex items-center justify-center rounded-lg bg-gradient-to-br from-purple-50 to-amber-50 ring-1 ring-purple-100"
        style={{ width: PREVIEW_BOX_PX, height: PREVIEW_BOX_PX }}
        data-testid="erase-brush-preview"
      >
        <div
          className="rounded-full bg-purple-600/40 ring-2 ring-purple-700"
          style={{
            width: safePreviewDiameter,
            height: safePreviewDiameter,
          }}
        />
      </div>

      {/* Big brush-size slider with min/max labels and the current
          value in pixels. */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-semibold text-purple-800">
            Brush size
          </span>
          <span className="text-xs font-bold text-purple-900 tabular-nums">
            {eraseBrushSize} px
          </span>
        </div>
        <input
          type="range"
          min={MIN_BRUSH}
          max={MAX_BRUSH}
          value={eraseBrushSize}
          onChange={(e) => setEraseBrushSize(+e.target.value)}
          className="w-full accent-purple-600"
          data-testid="panel-slider-erase-brush"
        />
        <div className="flex justify-between text-[9px] text-purple-500 mt-0.5">
          <span>{MIN_BRUSH}</span>
          <span>{MAX_BRUSH}</span>
        </div>
      </div>

      {/* Preset size chips. Tapping one snaps the slider to that
          size — fast and finger-friendly on mobile. */}
      <div>
        <span className="text-[11px] font-semibold text-purple-800">
          Presets
        </span>
        <div className="grid grid-cols-4 gap-1.5 mt-1">
          {PRESETS.map((p) => {
            const active = eraseBrushSize === p.value;
            return (
              <button
                key={p.value}
                onClick={() => setEraseBrushSize(p.value)}
                className={
                  "px-1.5 py-1 text-[10px] font-semibold rounded border transition-colors " +
                  (active
                    ? "bg-purple-700 text-white border-purple-700"
                    : "bg-white text-purple-800 border-purple-200 hover:bg-purple-50")
                }
                data-testid={`btn-erase-preset-${p.value}`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
