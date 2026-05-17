/**
 * Adjustments tab — sliders for the basic photo properties (Lightroom
 * cluster: temperature, tint, brightness, contrast, highlights, shadows,
 * saturation, clarity, vignette).
 *
 * Every slider writes back to the live ImageElement via the studio store;
 * `_commit()` snapshots history on `onValueCommit` so the entire drag is
 * one undo step (instead of one per pixel).
 */

import { useMemo } from "react";
import { Wand2, RotateCcw } from "lucide-react";
import { useStudio } from "../../store";
import type { ImageElement } from "../../types";
import { SliderRow } from "./SliderRow";
import { ADJUSTMENT_FIELDS } from "../../imageEffects";

interface Props {
  el: ImageElement;
}

export function AdjustmentsSection({ el }: Props) {
  const updateElement = useStudio((s) => s.updateElement);
  const _commit = useStudio((s) => s._commit);

  const setField = (
    field: keyof ImageElement,
    value: number,
  ) => {
    updateElement(el.id, { [field]: value } as Partial<ImageElement>);
  };

  // Brightness is stored -1..1 internally; the slider is friendlier as -100..100.
  const brightness100 = useMemo(
    () => Math.round((el.brightness ?? 0) * 100),
    [el.brightness],
  );

  const reset = () => {
    _commit();
    const patch: Partial<ImageElement> = { imagePreset: null };
    for (const f of ADJUSTMENT_FIELDS) {
      (patch as any)[f] = 0;
    }
    updateElement(el.id, patch);
  };

  /**
   * "Auto adjust" — tasteful one-click: small contrast + saturation +
   * clarity bump and gentle highlight pull-down. Doesn't touch
   * temperature so it stays neutral.
   */
  const autoAdjust = () => {
    _commit();
    updateElement(el.id, {
      brightness: 0.04,
      contrast: 12,
      saturation: 12,
      clarity: 18,
      highlights: -8,
      shadowsAdj: 8,
      imagePreset: "auto",
    });
  };

  return (
    <div className="space-y-3">
      {/* ── Auto / Reset row ────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={autoAdjust}
          className="flex items-center justify-center gap-1 rounded-md bg-gradient-to-r from-purple-600 to-fuchsia-600 px-2.5 py-2 text-xs font-bold text-white shadow-sm hover:opacity-95"
          data-testid="btn-auto-adjust"
        >
          <Wand2 className="h-3.5 w-3.5" /> Auto adjust
        </button>
        <button
          type="button"
          onClick={reset}
          className="flex items-center justify-center gap-1 rounded-md border border-purple-300 bg-white px-2.5 py-2 text-xs font-bold text-purple-700 hover:bg-purple-50"
          data-testid="btn-reset-adjust"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Reset
        </button>
      </div>

      {/* ── Light cluster ───────────────────────────────────────── */}
      <Group title="Light">
        <SliderRow
          label="Brightness"
          value={brightness100}
          signed
          onChange={(v) => updateElement(el.id, { brightness: v / 100 })}
          onDragStart={_commit}
          testId="slider-brightness"
        />
        <SliderRow
          label="Contrast"
          value={el.contrast ?? 0}
          signed
          onChange={(v) => setField("contrast", v)}
          onDragStart={_commit}
          testId="slider-contrast"
        />
        <SliderRow
          label="Highlights"
          value={el.highlights ?? 0}
          signed
          onChange={(v) => setField("highlights", v)}
          onDragStart={_commit}
          testId="slider-highlights"
        />
        <SliderRow
          label="Shadows"
          value={el.shadowsAdj ?? 0}
          signed
          onChange={(v) => setField("shadowsAdj", v)}
          onDragStart={_commit}
          testId="slider-shadows-adj"
        />
      </Group>

      {/* ── Colour cluster ──────────────────────────────────────── */}
      <Group title="Colour">
        <SliderRow
          label="Temperature"
          value={el.temperature ?? 0}
          signed
          onChange={(v) => setField("temperature", v)}
          onDragStart={_commit}
          testId="slider-temperature"
        />
        <SliderRow
          label="Tint"
          value={el.tint ?? 0}
          signed
          onChange={(v) => setField("tint", v)}
          onDragStart={_commit}
          testId="slider-tint"
        />
        <SliderRow
          label="Saturation"
          value={el.saturation ?? 0}
          signed
          onChange={(v) => setField("saturation", v)}
          onDragStart={_commit}
          testId="slider-saturation"
        />
        <SliderRow
          label="Hue"
          value={el.hue ?? 0}
          signed
          unit="°"
          min={-180}
          max={180}
          onChange={(v) => setField("hue", v)}
          onDragStart={_commit}
          testId="slider-hue"
        />
      </Group>

      {/* ── Detail cluster ──────────────────────────────────────── */}
      <Group title="Detail">
        <SliderRow
          label="Clarity"
          value={el.clarity ?? 0}
          signed
          onChange={(v) => setField("clarity", v)}
          onDragStart={_commit}
          testId="slider-clarity"
        />
        <SliderRow
          label="Blur"
          value={el.blurAmount ?? 0}
          unit="px"
          min={0}
          max={50}
          onChange={(v) => setField("blurAmount", v)}
          onDragStart={_commit}
          testId="slider-blur"
        />
        <SliderRow
          label="Vignette"
          value={el.vignette ?? 0}
          min={0}
          max={100}
          onChange={(v) => setField("vignette", v)}
          onDragStart={_commit}
          testId="slider-vignette"
        />
      </Group>

      <p className="text-[10px] text-purple-500 leading-snug pt-1">
        Tip: drag a slider for a live preview, release to save (each release
        is one undo step).
      </p>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 rounded-lg border border-purple-200 bg-white p-2.5">
      <h4 className="text-[10px] font-bold uppercase tracking-wider text-purple-600">
        {title}
      </h4>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}
