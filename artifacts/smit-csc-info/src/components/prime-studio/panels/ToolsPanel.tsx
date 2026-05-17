/**
 * Tools panel — image editing hub for the currently-selected image.
 *
 * Tabs (top of panel):
 *   • AI       — BG Remove + AI Enhance (existing on-device pipelines)
 *   • Adjust   — Lightroom-style sliders (temperature, brightness, …)
 *   • Filters  — preset grid (Natural / Warm / Cool / Mono / Vintage)
 *   • Shadows  — Glow / Drop / Outline / Page-lift / Angled / Backdrop
 *
 * For Adjust / Filters / Shadows the user can also pick the application
 * area (All / Foreground / Background) — the latter two require an AI
 * cut-out and surface a hint asking the user to run BG Remove first.
 *
 * Opened from the floating contextual toolbar's "Tools" button (image
 * controls section) which sets `sidebarTab="tools"`.
 */

import { useState } from "react";
import {
  Wand2,
  Sparkles,
  Loader2,
  MousePointerClick,
  Zap,
  Sliders,
  Image as ImageIcon,
  Layers,
} from "lucide-react";
import { useStudio, useActivePage } from "../store";
import type { ElementData, ImageElement } from "../types";
import { AreaSelector } from "./tools/AreaSelector";
import { AdjustmentsSection } from "./tools/AdjustmentsSection";
import { FiltersSection } from "./tools/FiltersSection";
import { ShadowsSection } from "./tools/ShadowsSection";

type TabId = "ai" | "adjust" | "filters" | "shadows";

const TABS: Array<{ id: TabId; label: string; Icon: any }> = [
  { id: "ai", label: "AI", Icon: Sparkles },
  { id: "adjust", label: "Adjust", Icon: Sliders },
  { id: "filters", label: "Filters", Icon: ImageIcon },
  { id: "shadows", label: "Shadows", Icon: Layers },
];

export function ToolsPanel() {
  const selectedIds = useStudio((s) => s.selectedIds);
  const updateElement = useStudio((s) => s.commitUpdateElement);
  const page = useActivePage();

  const [tab, setTab] = useState<TabId>("ai");
  const [removingBg, setRemovingBg] = useState(false);
  const [upscaling, setUpscaling] = useState(false);
  const [upscaleProgress, setUpscaleProgress] = useState(0);

  // First selected image (multi-select isn't supported here).
  const selectedEls =
    page?.elements.filter((e) => selectedIds.includes(e.id)) ?? [];
  const iEl =
    selectedEls.length === 1 && selectedEls[0].type === "image"
      ? (selectedEls[0] as ImageElement)
      : null;

  // Validate at completion that the captured target (element + src
  // snapshot) is still the same one the user kicked the long-running op
  // against. Look across ALL pages so a page-switch alone is tolerated.
  const findElementOnAnyPage = (elId: string): ImageElement | null => {
    const pages = useStudio.getState().pages;
    for (const p of pages) {
      const e = p.elements.find((x) => x.id === elId);
      if (e && e.type === "image") return e as ImageElement;
    }
    return null;
  };

  const removeBg = async () => {
    if (!iEl) return;
    if (removingBg || upscaling) return;
    const targetId = iEl.id;
    const targetSrc = iEl.src;
    try {
      setRemovingBg(true);
      const { removeBackground } = await import("@imgly/background-removal");
      const blob = await removeBackground(targetSrc);
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((res, rej) => {
        reader.onload = () => res(String(reader.result));
        reader.onerror = rej;
        reader.readAsDataURL(blob);
      });
      const found = findElementOnAnyPage(targetId);
      if (!found || found.src !== targetSrc) {
        console.warn("BG remove: target changed during processing — discarding");
        return;
      }
      updateElement(targetId, { src: dataUrl } as Partial<ElementData>);
      // NOTE: We deliberately do NOT URL.revokeObjectURL(targetSrc)
      // even when targetSrc is a blob: URL. That URL may still be
      // referenced by the Uploads library (UploadedAsset.src) or by
      // another project's element of the same image. Revoking would
      // break those thumbnails / images. The original blob is held by
      // the browser until tab reload — a bounded leak that's the
      // safer trade-off until per-URL ref-counting exists.
    } catch (e) {
      console.error("BG remove failed", e);
      alert("Background removal failed: " + (e as Error).message);
    } finally {
      setRemovingBg(false);
    }
  };

  const upscale = async (scale: 2 | 4) => {
    if (!iEl) return;
    if (upscaling || removingBg) return;
    const targetId = iEl.id;
    const targetSrc = iEl.src;
    try {
      setUpscaling(true);
      setUpscaleProgress(0);
      const img = await new Promise<HTMLImageElement>((res, rej) => {
        const i = new Image();
        i.crossOrigin = "anonymous";
        i.onload = () => res(i);
        i.onerror = () => rej(new Error("Could not load image for upscaling"));
        i.src = targetSrc;
      });
      const inputMP = (img.naturalWidth * img.naturalHeight) / 1_000_000;
      const outputMP = inputMP * scale * scale;
      const MAX_OUTPUT_MP = 64;
      if (outputMP > MAX_OUTPUT_MP) {
        const suggested =
          scale === 4 && inputMP * 4 <= MAX_OUTPUT_MP ? "2×" : "a smaller image";
        alert(
          `This image is too large for ${scale}× enhancement (would render ~${outputMP.toFixed(
            0,
          )} MP). Try ${suggested} instead.`,
        );
        return;
      }
      const { upscaleImage } = await import("@/lib/tools/image-enhance");
      const out = await upscaleImage(img, {
        scale,
        denoise: 0.35,
        sharpen: 0.7,
        onProgress: (p) => setUpscaleProgress(p),
      });
      const isTransparent = targetSrc.startsWith("data:image/png");
      const dataUrl = isTransparent
        ? out.toDataURL("image/png")
        : out.toDataURL("image/jpeg", 0.92);
      const found = findElementOnAnyPage(targetId);
      if (!found || found.src !== targetSrc) {
        console.warn("Upscale: target changed during processing — discarding");
        return;
      }
      updateElement(targetId, { src: dataUrl } as Partial<ElementData>);
      // Same rationale as removeBg above: do NOT revoke targetSrc even
      // if it's a blob: URL — Uploads library / cross-project sharing
      // could still be using it.
    } catch (e) {
      console.error("Upscale failed", e);
      alert("Image upscale failed: " + (e as Error).message);
    } finally {
      setUpscaling(false);
      setUpscaleProgress(0);
    }
  };

  // ── Empty state: no image selected ────────────────────────────────
  if (!iEl) {
    return (
      <div className="p-4 space-y-3">
        <h3 className="text-base font-bold text-purple-950">Tools</h3>
        <div className="rounded-lg border border-purple-200 bg-purple-50/60 p-4 text-center space-y-2">
          <MousePointerClick className="h-7 w-7 text-purple-400 mx-auto" />
          <p className="text-xs text-purple-800 font-semibold">
            Select an image on the page
          </p>
          <p className="text-[11px] text-purple-600 leading-snug">
            Filters, adjustments, shadows and AI tools all need an image.
            Click any photo on the canvas to unlock them.
          </p>
        </div>
      </div>
    );
  }

  const busy = removingBg || upscaling;

  return (
    <div className="flex h-full flex-col">
      {/* ── Header + tab strip ─────────────────────────────────── */}
      <div className="border-b border-purple-200 bg-gradient-to-b from-purple-50 to-white p-3 space-y-2.5">
        <h3 className="text-base font-bold text-purple-950">Tools</h3>
        <div className="grid grid-cols-4 gap-1 rounded-lg bg-purple-100/80 p-1">
          {TABS.map(({ id, label, Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={
                  "flex flex-col items-center gap-0.5 rounded-md px-1 py-1.5 text-[10px] font-bold transition-colors " +
                  (active
                    ? "bg-white text-purple-900 shadow-sm ring-1 ring-purple-300"
                    : "text-purple-600 hover:bg-white/60")
                }
                data-testid={`tab-tools-${id}`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Scrollable section body ─────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Area selector — only meaningful for non-AI tabs */}
        {tab !== "ai" && (
          <AreaSelector
            value={iEl.imageEffectArea}
            onChange={(v) => updateElement(iEl.id, { imageEffectArea: v })}
          />
        )}

        {tab === "ai" && (
          <AISection
            removingBg={removingBg}
            upscaling={upscaling}
            upscaleProgress={upscaleProgress}
            busy={busy}
            removeBg={removeBg}
            upscale={upscale}
          />
        )}
        {tab === "adjust" && <AdjustmentsSection el={iEl} />}
        {tab === "filters" && <FiltersSection el={iEl} />}
        {tab === "shadows" && <ShadowsSection el={iEl} />}
      </div>
    </div>
  );
}

// ── AI section (kept inline because it owns local async state) ───────

interface AIProps {
  removingBg: boolean;
  upscaling: boolean;
  upscaleProgress: number;
  busy: boolean;
  removeBg: () => void;
  upscale: (scale: 2 | 4) => void;
}

function AISection({
  removingBg,
  upscaling,
  upscaleProgress,
  busy,
  removeBg,
  upscale,
}: AIProps) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-purple-700">
        On-device AI — your photo never leaves the browser.
      </p>

      {/* ── BG Remove ───────────────────────────────────────────── */}
      <section className="rounded-lg border border-fuchsia-200 bg-fuchsia-50/60 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Wand2 className="h-4 w-4 text-fuchsia-600" />
          <h4 className="text-sm font-bold text-purple-950 flex-1">
            Background Remover
          </h4>
        </div>
        <p className="text-[11px] text-purple-700 leading-snug">
          Cuts out the subject and makes the rest transparent — perfect for
          ID photos, product shots and stickers.
        </p>
        <button
          onClick={removeBg}
          disabled={busy}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-fuchsia-500 hover:bg-fuchsia-600 text-white rounded text-xs font-bold disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          data-testid="btn-bg-remove"
        >
          {removingBg ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Removing
              background…
            </>
          ) : (
            <>
              <Wand2 className="h-3.5 w-3.5" /> Remove background
            </>
          )}
        </button>
      </section>

      {/* ── Upscaler ────────────────────────────────────────────── */}
      <section className="rounded-lg border border-amber-300 bg-amber-50/60 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-500" />
          <h4 className="text-sm font-bold text-purple-950 flex-1">
            AI Enhance / Upscale
          </h4>
        </div>
        <p className="text-[11px] text-purple-700 leading-snug">
          Re-renders the photo at higher resolution using on-device AI.
          Sharper edges, less noise — on-canvas size stays the same.
        </p>
        {upscaling ? (
          <div className="space-y-1.5 pt-1">
            <div className="h-1.5 bg-purple-100 rounded overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-400 to-fuchsia-500 transition-all"
                style={{ width: `${upscaleProgress}%` }}
              />
            </div>
            <div className="text-[10px] text-purple-700 text-center tabular-nums">
              {upscaleProgress}% — first run downloads the AI model (~5 MB)
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              onClick={() => upscale(2)}
              disabled={busy}
              className="px-2 py-2.5 bg-white hover:bg-purple-50 border border-purple-200 rounded text-xs font-bold text-purple-900 flex flex-col items-center gap-0.5 disabled:opacity-60"
              data-testid="btn-upscale-2x"
            >
              <span className="text-base flex items-center gap-0.5">
                <Zap className="h-3 w-3" /> 2×
              </span>
              <span className="text-[9px] font-normal text-purple-600">
                Faster
              </span>
            </button>
            <button
              onClick={() => upscale(4)}
              disabled={busy}
              className="px-2 py-2.5 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded text-xs font-bold text-amber-900 flex flex-col items-center gap-0.5 disabled:opacity-60"
              data-testid="btn-upscale-4x"
            >
              <span className="text-base flex items-center gap-0.5">
                <Sparkles className="h-3 w-3" /> 4×
              </span>
              <span className="text-[9px] font-normal text-amber-700">
                Best quality
              </span>
            </button>
          </div>
        )}
      </section>

      <p className="text-[10px] text-purple-500 leading-snug">
        Tip: Ctrl + Z reverts to the original image.
      </p>
    </div>
  );
}
