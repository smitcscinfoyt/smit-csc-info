/**
 * Filters tab — preset grid grouped by category. Each thumbnail is a tiny
 * preview of the selected image with the preset's CSS-filter equivalent
 * applied (close enough for a thumbnail; the on-canvas Konva pipeline is
 * the source of truth).
 */

import { useMemo } from "react";
import { Check } from "lucide-react";
import { useStudio } from "../../store";
import type { ImageElement } from "../../types";
import {
  IMAGE_FILTER_PRESETS,
  ADJUSTMENT_FIELDS,
  type ImageFilterPreset,
} from "../../imageEffects";

interface Props {
  el: ImageElement;
}

const CATEGORIES: Array<{ id: ImageFilterPreset["category"]; label: string }> = [
  { id: "natural", label: "Natural" },
  { id: "warm", label: "Warm" },
  { id: "cool", label: "Cool" },
  { id: "mono", label: "Mono" },
  { id: "vintage", label: "Vintage" },
];

export function FiltersSection({ el }: Props) {
  const updateElement = useStudio((s) => s.updateElement);
  const _commit = useStudio((s) => s._commit);

  const grouped = useMemo(() => {
    const map: Record<string, ImageFilterPreset[]> = {};
    for (const p of IMAGE_FILTER_PRESETS) {
      (map[p.category] ||= []).push(p);
    }
    return map;
  }, []);

  const applyPreset = (preset: ImageFilterPreset) => {
    _commit();
    // Start by zeroing every adjustment so presets don't stack on top of
    // the previous one — then apply the preset's params.
    const patch: Partial<ImageElement> = {
      imagePreset: preset.id,
      filter: "none",
    };
    for (const f of ADJUSTMENT_FIELDS) {
      (patch as any)[f] = 0;
    }
    Object.assign(patch, preset.params);
    updateElement(el.id, patch);
  };

  const clearPreset = () => {
    _commit();
    const patch: Partial<ImageElement> = {
      imagePreset: null,
      filter: "none",
    };
    for (const f of ADJUSTMENT_FIELDS) {
      (patch as any)[f] = 0;
    }
    updateElement(el.id, patch);
  };

  const activeId = el.imagePreset ?? null;

  return (
    <div className="space-y-3">
      {/* "Original" tile + clear */}
      <button
        type="button"
        onClick={clearPreset}
        className={
          "w-full flex items-center justify-between rounded-md border px-3 py-2 text-xs font-bold transition-colors " +
          (!activeId
            ? "border-purple-500 bg-purple-50 text-purple-900 ring-1 ring-purple-300"
            : "border-purple-200 bg-white text-purple-700 hover:bg-purple-50")
        }
        data-testid="btn-filter-original"
      >
        <span>Original (no filter)</span>
        {!activeId && <Check className="h-3.5 w-3.5" />}
      </button>

      {CATEGORIES.map((cat) => {
        const presets = grouped[cat.id] ?? [];
        if (!presets.length) return null;
        return (
          <section key={cat.id} className="space-y-1.5">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-purple-600">
              {cat.label}
            </h4>
            <div className="grid grid-cols-3 gap-1.5">
              {presets.map((p) => (
                <PresetThumb
                  key={p.id}
                  preset={p}
                  src={el.src}
                  active={activeId === p.id}
                  onClick={() => applyPreset(p)}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

interface ThumbProps {
  preset: ImageFilterPreset;
  src: string;
  active: boolean;
  onClick: () => void;
}

function PresetThumb({ preset, src, active, onClick }: ThumbProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "group relative aspect-square overflow-hidden rounded-md border-2 transition-all " +
        (active
          ? "border-amber-500 ring-2 ring-amber-200"
          : "border-purple-200 hover:border-purple-400")
      }
      data-testid={`btn-filter-${preset.id}`}
      title={preset.name}
    >
      <img
        src={src}
        alt={preset.name}
        crossOrigin="anonymous"
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover"
        style={{ filter: preset.css }}
      />
      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-1 py-1 text-center text-[9px] font-bold leading-tight text-white">
        {preset.name}
      </span>
      {active && (
        <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-white shadow">
          <Check className="h-2.5 w-2.5" strokeWidth={3} />
        </span>
      )}
    </button>
  );
}
