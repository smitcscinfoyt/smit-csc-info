/**
 * Shadows tab — preset grid (Glow / Drop / Outline / Page-lift / Angled /
 * Backdrop) plus customisable sliders for the active preset.
 */

import { useRef } from "react";
import { Check, X as XIcon } from "lucide-react";
import { useStudio } from "../../store";
import type { ImageElement } from "../../types";
import {
  SHADOW_PRESETS,
  CLEAR_SHADOW_PATCH,
  type ShadowPreset,
} from "../../imageEffects";
import { SliderRow } from "./SliderRow";

interface Props {
  el: ImageElement;
}

export function ShadowsSection({ el }: Props) {
  const updateElement = useStudio((s) => s.updateElement);
  const _commit = useStudio((s) => s._commit);

  const activePresetId = el.imageShadowPreset ?? null;
  const activePreset = SHADOW_PRESETS.find((p) => p.id === activePresetId);

  const apply = (preset: ShadowPreset) => {
    _commit();
    updateElement(el.id, preset.apply(el));
  };

  const clear = () => {
    _commit();
    updateElement(el.id, CLEAR_SHADOW_PATCH);
  };

  const updateShadow = (patch: Partial<NonNullable<ImageElement["shadow"]>>) => {
    if (!el.shadow) return;
    updateElement(el.id, { shadow: { ...el.shadow, ...patch } });
  };

  return (
    <div className="space-y-3">
      {/* ── None / clear tile ──────────────────────────────────── */}
      <button
        type="button"
        onClick={clear}
        className={
          "w-full flex items-center justify-between rounded-md border px-3 py-2 text-xs font-bold transition-colors " +
          (!activePresetId
            ? "border-purple-500 bg-purple-50 text-purple-900 ring-1 ring-purple-300"
            : "border-purple-200 bg-white text-purple-700 hover:bg-purple-50")
        }
        data-testid="btn-shadow-none"
      >
        <span className="flex items-center gap-1.5">
          <XIcon className="h-3.5 w-3.5" /> No shadow
        </span>
        {!activePresetId && <Check className="h-3.5 w-3.5" />}
      </button>

      {/* ── Preset grid ─────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-1.5">
        {SHADOW_PRESETS.map((p) => (
          <ShadowPresetThumb
            key={p.id}
            preset={p}
            active={activePresetId === p.id}
            onClick={() => apply(p)}
          />
        ))}
      </div>

      {/* ── Custom controls for the active preset ───────────────── */}
      {activePresetId === "outline" && el.imageOutline && (
        <section className="space-y-2.5 rounded-lg border border-purple-200 bg-white p-2.5">
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-purple-600">
            Outline
          </h4>
          <ColorRow
            label="Colour"
            value={el.imageOutline.color}
            onChange={(c) =>
              updateElement(el.id, {
                imageOutline: { ...el.imageOutline!, color: c },
              })
            }
            onDragStart={_commit}
          />
          <SliderRow
            label="Width"
            value={el.imageOutline.width}
            min={1}
            max={40}
            unit="px"
            onChange={(v) =>
              updateElement(el.id, {
                imageOutline: { ...el.imageOutline!, width: v },
              })
            }
            onDragStart={_commit}
          />
        </section>
      )}

      {activePreset && activePresetId !== "outline" && el.shadow && (
        <section className="space-y-2.5 rounded-lg border border-purple-200 bg-white p-2.5">
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-purple-600">
            {activePreset.name}
          </h4>

          <ColorRow
            label="Colour"
            value={el.shadow.color}
            onChange={(c) => updateShadow({ color: c })}
            onDragStart={_commit}
          />

          {/* Glow has no offset — just blur + opacity */}
          {activePresetId === "glow" ? (
            <>
              <SliderRow
                label="Size"
                value={el.shadow.blur}
                min={0}
                max={120}
                unit="px"
                onChange={(v) => updateShadow({ blur: v })}
                onDragStart={_commit}
              />
              <SliderRow
                label="Intensity"
                value={Math.round(el.shadow.opacity * 100)}
                min={0}
                max={100}
                onChange={(v) => updateShadow({ opacity: v / 100 })}
                onDragStart={_commit}
              />
            </>
          ) : (
            <>
              <SliderRow
                label="Offset X"
                value={el.shadow.offsetX}
                signed
                min={-80}
                max={80}
                unit="px"
                onChange={(v) => updateShadow({ offsetX: v })}
                onDragStart={_commit}
              />
              <SliderRow
                label="Offset Y"
                value={el.shadow.offsetY}
                signed
                min={-80}
                max={80}
                unit="px"
                onChange={(v) => updateShadow({ offsetY: v })}
                onDragStart={_commit}
              />
              <SliderRow
                label="Blur"
                value={el.shadow.blur}
                min={0}
                max={80}
                unit="px"
                onChange={(v) => updateShadow({ blur: v })}
                onDragStart={_commit}
              />
              <SliderRow
                label="Opacity"
                value={Math.round(el.shadow.opacity * 100)}
                min={0}
                max={100}
                onChange={(v) => updateShadow({ opacity: v / 100 })}
                onDragStart={_commit}
              />
            </>
          )}
        </section>
      )}
    </div>
  );
}

interface ShadowThumbProps {
  preset: ShadowPreset;
  active: boolean;
  onClick: () => void;
}

/** Tiny visual hint for each shadow preset — a rounded square with the
 *  preset's signature shadow / outline applied via plain CSS. Cheap and
 *  good enough for a 96 px tile. */
function ShadowPresetThumb({ preset, active, onClick }: ShadowThumbProps) {
  const style: React.CSSProperties = {};
  switch (preset.id) {
    case "glow":
      style.boxShadow = "0 0 18px 4px rgba(250,204,21,0.85)";
      style.background = "#fff";
      break;
    case "drop":
      style.boxShadow = "8px 8px 12px rgba(0,0,0,0.35)";
      style.background = "#fff";
      break;
    case "outline":
      style.background = "#fff";
      style.outline = "3px solid #1f0a3c";
      style.outlineOffset = "-3px";
      break;
    case "page-lift":
      style.boxShadow = "0 14px 18px -4px rgba(0,0,0,0.32)";
      style.background = "#fff";
      break;
    case "angled":
      style.boxShadow = "10px 10px 0 rgba(31,10,60,0.55)";
      style.background = "#fff";
      break;
    case "backdrop":
      style.boxShadow = "9px 9px 0 rgba(250,204,21,0.9)";
      style.background = "#fff";
      break;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "relative flex flex-col items-center gap-1 rounded-md border-2 px-1 pt-2 pb-1 transition-all " +
        (active
          ? "border-amber-500 ring-2 ring-amber-200 bg-amber-50/40"
          : "border-purple-200 hover:border-purple-400 bg-white")
      }
      data-testid={`btn-shadow-${preset.id}`}
      title={preset.description}
    >
      <span
        className="h-9 w-9 rounded-sm"
        style={style}
        aria-hidden="true"
      />
      <span className="text-[9px] font-bold leading-tight text-purple-900">
        {preset.name}
      </span>
      {active && (
        <span className="absolute right-0.5 top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-500 text-white">
          <Check className="h-2 w-2" strokeWidth={3} />
        </span>
      )}
    </button>
  );
}

function ColorRow({
  label,
  value,
  onChange,
  onDragStart,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  /** Same semantics as SliderRow.onDragStart — fires once on the first
   *  change of an editing session so history snapshots the pre-edit state. */
  onDragStart?: () => void;
}) {
  const startedRef = useRef(false);
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-semibold text-purple-900">{label}</span>
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          value={value.startsWith("#") ? value : "#000000"}
          // Reset on every picker open (`onClick` fires before the OS
          // colour picker pops up) so each picker session counts as a
          // distinct undo step. Blur is unreliable here — many browsers
          // keep the input focused even after the picker closes, which
          // would collapse later edits into a single history entry.
          onClick={() => {
            startedRef.current = false;
          }}
          onChange={(e) => {
            if (!startedRef.current) {
              startedRef.current = true;
              onDragStart?.();
            }
            onChange(e.target.value);
          }}
          onBlur={() => {
            startedRef.current = false;
          }}
          className="h-7 w-9 cursor-pointer rounded border border-purple-300 bg-white p-0"
          data-testid="input-shadow-color"
        />
        <span className="font-mono text-[10px] uppercase text-purple-700">
          {value}
        </span>
      </div>
    </div>
  );
}
