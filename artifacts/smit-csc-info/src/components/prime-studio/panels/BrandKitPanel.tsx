/**
 * Brand Kit panel — store the centre's name, logo, colour swatches and
 * heading/body fonts once, then apply them to any selection or page in
 * one tap. Persistence lives in `useBrandKit` (localStorage).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Plus, Type, Upload, X } from "lucide-react";
import { useStudio, useActivePage } from "../store";
import type { ElementData, ImageElement } from "../types";
import { useBrandKit } from "./useBrandKit";
import {
  POPULAR_GOOGLE_FONTS,
  ensureFullCatalog,
  getCatalogSync,
  loadGoogleFont,
  type FontMeta,
} from "../fonts/catalog";

/** Read a File as a base64 data-URL. */
function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

/** Get natural pixel dimensions of an image referenced by URL. */
function getImageDims(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () =>
      resolve({
        width: img.naturalWidth || 240,
        height: img.naturalHeight || 240,
      });
    img.onerror = () => reject(new Error("image decode failed"));
    img.src = src;
  });
}

export function BrandKitPanel() {
  const { brand, setName, setLogo, addColor, removeColor, setHeadingFont, setBodyFont } =
    useBrandKit();

  const page = useActivePage();
  const selectedIds = useStudio((s) => s.selectedIds);

  const fileRef = useRef<HTMLInputElement>(null);
  const colorRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [fontList, setFontList] = useState<FontMeta[]>(() => getCatalogSync());

  // Lazily fill in the full catalog (popular subset shows immediately).
  useEffect(() => {
    let cancelled = false;
    ensureFullCatalog()
      .then((all) => {
        if (!cancelled) setFontList(all);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Make sure the currently picked heading/body fonts are actually
  // loaded so the small previews render in their real typeface.
  useEffect(() => {
    loadGoogleFont(brand.fonts.heading, [400, 700]).catch(() => {});
    loadGoogleFont(brand.fonts.body, [400, 700]).catch(() => {});
  }, [brand.fonts.heading, brand.fonts.body]);

  // Build the dropdown options once per catalog change. Use the popular
  // subset's family names as a fast-path so the user sees familiar
  // fonts at the top of the list.
  const fontOptions = useMemo(() => {
    const popular = new Set(POPULAR_GOOGLE_FONTS.map((f) => f.family));
    const all = fontList.map((f) => f.family);
    const popularFirst = [
      ...POPULAR_GOOGLE_FONTS.map((f) => f.family),
      ...all.filter((f) => !popular.has(f)),
    ];
    return Array.from(new Set(popularFirst));
  }, [fontList]);

  // ── Logo upload ────────────────────────────────────────
  const onPickLogo = async (files: FileList | null) => {
    if (!files || !files[0]) return;
    const file = files[0];
    if (!/^image\//.test(file.type)) {
      alert("Please pick an image file (PNG, JPG, SVG, etc.)");
      return;
    }
    setBusy(true);
    try {
      const dataUrl = await fileToDataURL(file);
      const { width, height } = await getImageDims(dataUrl);
      setLogo({ src: dataUrl, width, height });
    } catch (e) {
      alert(`Couldn't read that image: ${(e as Error).message}`);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const insertLogo = () => {
    if (!brand.logo) return;
    const pageW = page?.width ?? 1280;
    const pageH = page?.height ?? 720;
    const longest = Math.max(brand.logo.width, brand.logo.height) || 1;
    const scale = Math.min(1, 240 / longest);
    const w = brand.logo.width * scale;
    const h = brand.logo.height * scale;
    const el: Omit<ImageElement, "id"> = {
      type: "image",
      x: pageW / 2 - w / 2,
      y: pageH / 2 - h / 2,
      width: w,
      height: h,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      opacity: 1,
      src: brand.logo.src,
    };
    useStudio.getState().addElement(el as Omit<ElementData, "id">);
  };

  // ── Colour swatch click ────────────────────────────────
  const applyColor = (color: string) => {
    const studio = useStudio.getState();
    if (selectedIds.length > 0) {
      // Filter to selected elements that actually accept a `fill`.
      const fillable = studio.pages
        .find((p) => p.id === studio.activePageId)
        ?.elements.filter(
          (e) =>
            selectedIds.includes(e.id) &&
            (e.type === "rect" ||
              e.type === "circle" ||
              e.type === "text" ||
              e.type === "icon"),
        )
        .map((e) => e.id) ?? [];
      if (fillable.length > 0) {
        studio.commitUpdateElements(
          fillable,
          // `color` is what IconElement uses; we set both so the patch is
          // safe to apply across mixed types in one call.
          { fill: color, color } as Partial<ElementData>,
        );
        return;
      }
    }
    // No selection (or selection isn't fillable): paint the page.
    if (page) studio.setPageBackground(page.id, color);
  };

  // ── Font apply ─────────────────────────────────────────
  const applyFont = async (which: "heading" | "body") => {
    const family = which === "heading" ? brand.fonts.heading : brand.fonts.body;
    if (selectedIds.length === 0) {
      alert("Select a text element first to apply this font.");
      return;
    }
    await loadGoogleFont(family, [400, 700]).catch(() => {});
    const studio = useStudio.getState();
    const ids =
      studio.pages
        .find((p) => p.id === studio.activePageId)
        ?.elements.filter((e) => selectedIds.includes(e.id) && e.type === "text")
        .map((e) => e.id) ?? [];
    if (ids.length === 0) {
      alert("Select a text element first to apply this font.");
      return;
    }
    studio.commitUpdateElements(ids, { fontFamily: family } as Partial<ElementData>);
  };

  // ── New colour from picker ─────────────────────────────
  const handleNewColor = (e: React.ChangeEvent<HTMLInputElement>) => {
    const c = e.target.value;
    if (c) addColor(c.toLowerCase());
  };

  return (
    <div className="p-4 space-y-5">
      <div>
        <h3 className="text-base font-bold text-purple-950">Brand Kit</h3>
        <p className="text-xs text-purple-700 mt-1 leading-relaxed">
          Save your centre's name, logo, colours and fonts once — apply them
          to any design in one tap.
        </p>
      </div>

      {/* ── Centre name ── */}
      <section className="space-y-2">
        <label className="text-xs font-semibold text-purple-900 uppercase tracking-wide">
          Centre name
        </label>
        <input
          type="text"
          value={brand.name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My CSC Centre"
          data-testid="brand-kit-name-input"
          className="w-full px-3 py-2 rounded-lg border border-purple-200 bg-white text-sm text-purple-950 placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </section>

      {/* ── Logo ── */}
      <section className="space-y-2">
        <label className="text-xs font-semibold text-purple-900 uppercase tracking-wide">
          Logo
        </label>
        <div className="flex gap-3">
          <div
            className="w-24 h-24 shrink-0 rounded-lg border-2 border-dashed border-purple-200 bg-purple-50 flex items-center justify-center overflow-hidden"
            data-testid="brand-kit-logo-preview"
          >
            {brand.logo ? (
              <img
                src={brand.logo.src}
                alt="Brand logo preview"
                className="w-full h-full object-contain"
              />
            ) : (
              <ImagePlus className="h-8 w-8 text-purple-300" />
            )}
          </div>
          <div className="flex-1 flex flex-col gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={(e) => onPickLogo(e.target.files)}
              className="hidden"
              data-testid="brand-kit-logo-input"
              disabled={busy}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              data-testid="brand-kit-logo-upload"
              className="flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-gradient-to-r from-purple-700 to-indigo-700 text-white text-xs font-semibold shadow hover:from-purple-800 hover:to-indigo-800 disabled:opacity-60"
            >
              <Upload className="h-3.5 w-3.5" />
              {busy ? "Loading…" : brand.logo ? "Replace logo" : "Upload logo"}
            </button>
            <button
              type="button"
              onClick={insertLogo}
              disabled={!brand.logo}
              data-testid="brand-kit-logo-insert"
              className="py-2 px-3 rounded-lg border border-amber-400 bg-amber-50 text-amber-900 text-xs font-semibold hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Insert on canvas
            </button>
            {brand.logo && (
              <button
                type="button"
                onClick={() => setLogo(null)}
                data-testid="brand-kit-logo-remove"
                className="text-[11px] text-purple-600 hover:text-rose-600 underline self-start"
              >
                Remove logo
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ── Colours ── */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-purple-900 uppercase tracking-wide">
            Colours
          </label>
          <span className="text-[10px] text-purple-500">
            Click to apply • × to remove
          </span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {brand.colors.map((c) => (
            <div key={c} className="relative group aspect-square">
              <button
                type="button"
                onClick={() => applyColor(c)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  removeColor(c);
                }}
                title={`${c} — click to apply, right-click to remove`}
                data-testid={`brand-kit-color-${c}`}
                className="w-full h-full rounded-lg border-2 border-white ring-1 ring-purple-200 shadow-sm hover:scale-105 transition-transform"
                style={{ backgroundColor: c }}
              />
              <button
                type="button"
                onClick={() => removeColor(c)}
                data-testid={`brand-kit-color-remove-${c}`}
                className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-rose-600 hover:bg-rose-700 text-white rounded-full p-0.5 shadow"
                title={`Remove ${c}`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => colorRef.current?.click()}
            data-testid="brand-kit-color-add"
            className="aspect-square rounded-lg border-2 border-dashed border-purple-300 bg-purple-50 flex items-center justify-center text-purple-500 hover:border-purple-500 hover:text-purple-700"
            title="Add a new colour"
          >
            <Plus className="h-5 w-5" />
          </button>
          <input
            ref={colorRef}
            type="color"
            onChange={handleNewColor}
            className="sr-only"
            data-testid="brand-kit-color-input"
          />
        </div>
      </section>

      {/* ── Fonts ── */}
      <section className="space-y-3">
        <label className="text-xs font-semibold text-purple-900 uppercase tracking-wide">
          Fonts
        </label>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-purple-700">
              Heading font
            </span>
            <span
              className="text-base font-semibold text-purple-950 truncate max-w-[55%] text-right"
              style={{ fontFamily: `'${brand.fonts.heading}', sans-serif` }}
            >
              {brand.fonts.heading}
            </span>
          </div>
          <select
            value={brand.fonts.heading}
            onChange={(e) => setHeadingFont(e.target.value)}
            data-testid="brand-kit-font-heading-select"
            className="w-full px-2 py-2 rounded-lg border border-purple-200 bg-white text-sm text-purple-950 focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            {fontOptions.map((f) => (
              <option key={`h-${f}`} value={f}>
                {f}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => applyFont("heading")}
            data-testid="brand-kit-font-heading-apply"
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-gradient-to-r from-purple-700 to-indigo-700 text-white text-xs font-semibold shadow hover:from-purple-800 hover:to-indigo-800"
          >
            <Type className="h-3.5 w-3.5" />
            Apply heading font
          </button>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-purple-700">
              Body font
            </span>
            <span
              className="text-sm font-medium text-purple-950 truncate max-w-[55%] text-right"
              style={{ fontFamily: `'${brand.fonts.body}', sans-serif` }}
            >
              {brand.fonts.body}
            </span>
          </div>
          <select
            value={brand.fonts.body}
            onChange={(e) => setBodyFont(e.target.value)}
            data-testid="brand-kit-font-body-select"
            className="w-full px-2 py-2 rounded-lg border border-purple-200 bg-white text-sm text-purple-950 focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            {fontOptions.map((f) => (
              <option key={`b-${f}`} value={f}>
                {f}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => applyFont("body")}
            data-testid="brand-kit-font-body-apply"
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg border border-amber-400 bg-amber-50 text-amber-900 text-xs font-semibold hover:bg-amber-100"
          >
            <Type className="h-3.5 w-3.5" />
            Apply body font
          </button>
        </div>
      </section>
    </div>
  );
}
