/**
 * Text panel — quick presets (Heading / Subheading / Body), font-family
 * picker, and a starter set of premium font combos. Selecting a preset
 * inserts a TextElement into the centre of the page.
 */

import { useEffect, useState } from "react";
import { useStudio, useActivePage } from "../store";
import type { ElementData, TextElement } from "../types";
import { FontPicker } from "../fonts/FontPicker";
import { loadGoogleFont, POPULAR_GOOGLE_FONTS } from "../fonts/catalog";

// Quick-pick grid — top fonts by category. The full 2000+ catalogue is
// reachable through the FontPicker search.
const FONT_QUICK_PICK = [
  "Inter", "Poppins", "Montserrat", "Roboto",
  "Lora", "Playfair Display", "Merriweather", "EB Garamond",
  "Bebas Neue", "Anton", "Oswald", "Archivo Black",
  "Pacifico", "Caveat", "Dancing Script", "Great Vibes",
  "Noto Sans Gujarati", "Mukta Vaani", "Hind Vadodara", "Shrikhand",
];

interface TextPreset {
  label: string;
  fontSize: number;
  fontStyle: string;
  fontFamily: string;
  text: string;
  className: string;
}

const PRESETS: TextPreset[] = [
  { label: "Add a heading", fontSize: 96, fontStyle: "bold", fontFamily: "Poppins", text: "Add a heading", className: "text-2xl font-bold" },
  { label: "Add a subheading", fontSize: 56, fontStyle: "bold", fontFamily: "Poppins", text: "Add a subheading", className: "text-lg font-semibold" },
  { label: "Add body text", fontSize: 28, fontStyle: "normal", fontFamily: "Inter", text: "Add a little bit of body text", className: "text-sm" },
];

export function TextPanel() {
  const addElement = useStudio((s) => s.addElement);
  const page = useActivePage();
  const cx = (page?.width ?? 1280) / 2;
  const cy = (page?.height ?? 720) / 2;
  const [pickerFont, setPickerFont] = useState("Poppins");

  // Pre-load preview fonts in the quick-pick grid so they render in
  // their actual typeface as soon as the panel mounts.
  useEffect(() => {
    FONT_QUICK_PICK.forEach((f) => loadGoogleFont(f, [400]).catch(() => {}));
  }, []);

  const insertText = (p: TextPreset) => {
    const w = Math.min(page?.width ?? 1200, p.fontSize * p.text.length * 0.45);
    const el: Omit<TextElement, "id"> = {
      type: "text",
      x: cx - w / 2,
      y: cy - p.fontSize / 2,
      width: w,
      height: p.fontSize * 1.4,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      opacity: 1,
      text: p.text,
      fontFamily: p.fontFamily,
      fontSize: p.fontSize,
      fontStyle: p.fontStyle,
      textDecoration: "",
      align: "center",
      fill: "#0f172a",
      lineHeight: 1.2,
      letterSpacing: 0,
    };
    addElement(el as Omit<ElementData, "id">);
  };

  const insertWithFont = async (family: string) => {
    await loadGoogleFont(family);
    insertText({
      label: family,
      // Show "Aa" preview universally — Gujarati script is no longer
      // hard-coded in the UI; users add their own copy after insert.
      text: "Aa",
      fontFamily: family,
      fontSize: 64,
      fontStyle: "normal",
      className: "",
    });
  };

  return (
    <div className="p-4 space-y-4">
      <div>
        <h3 className="text-base font-bold text-purple-950 mb-2">Default text styles</h3>
        <div className="space-y-2">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => insertText(p)}
              className={`w-full text-left px-4 py-3 rounded-lg border border-purple-200 hover:border-purple-500 hover:bg-purple-50 transition-all ${p.className}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Full catalogue search — 2000+ Google Fonts */}
      <div>
        <h4 className="text-[11px] font-bold tracking-wider uppercase text-purple-700 mb-2">
          Browse all Google Fonts
        </h4>
        <div className="flex items-center gap-2">
          <FontPicker
            value={pickerFont}
            onChange={(f) => setPickerFont(f)}
            className="flex-1 flex items-center justify-between gap-1 text-sm border border-purple-200 rounded-md px-3 py-2 hover:bg-purple-50"
          />
          <button
            type="button"
            onClick={() => insertWithFont(pickerFont)}
            className="text-xs font-bold px-3 py-2 rounded-md bg-purple-600 text-white hover:bg-purple-700"
          >
            Add
          </button>
        </div>
        <p className="text-[10px] text-purple-500 mt-1">
          2,000+ fonts via Google Fonts • Gujarati supported
        </p>
      </div>

      <div>
        <h4 className="text-[11px] font-bold tracking-wider uppercase text-purple-700 mb-2">
          Quick picks
        </h4>
        <div className="grid grid-cols-2 gap-2">
          {FONT_QUICK_PICK.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => insertWithFont(f)}
              className="px-3 py-3 rounded-md border border-purple-200 hover:border-purple-500 hover:bg-purple-50 text-purple-950 text-sm transition-colors"
              style={{ fontFamily: f }}
              title={f}
            >
              Aa
              <div className="text-[9px] text-purple-500 mt-0.5">{f}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
