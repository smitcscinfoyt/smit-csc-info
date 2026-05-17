/**
 * Apps & Add-ons → Barcode sub-panel.
 *
 * Renders a 1-D barcode via JsBarcode into an off-screen canvas, then
 * exports it as a PNG data-URL for both the on-panel preview and the
 * "Insert on canvas" action (600×180 image).
 */

import { useEffect, useRef, useState } from "react";
// jsbarcode ships as CJS — silence the TS no-default-export warning.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — jsbarcode CJS interop
import JsBarcode from "jsbarcode";
import { Barcode as BarcodeIcon, Sparkles } from "lucide-react";
import { useStudio, useActivePage } from "../../store";
import type { ElementData, ImageElement } from "../../types";
import { cn } from "@/lib/utils";

type BcFormat =
  | "CODE128"
  | "EAN13"
  | "EAN8"
  | "CODE39"
  | "UPC"
  | "ITF14";

const FORMATS: { value: BcFormat; label: string; placeholder: string }[] = [
  { value: "CODE128", label: "CODE128", placeholder: "Any text or numbers" },
  { value: "EAN13", label: "EAN-13", placeholder: "12 or 13 digits" },
  { value: "EAN8", label: "EAN-8", placeholder: "7 or 8 digits" },
  { value: "CODE39", label: "CODE39", placeholder: "A-Z 0-9 - . $ / + %" },
  { value: "UPC", label: "UPC-A", placeholder: "11 or 12 digits" },
  { value: "ITF14", label: "ITF-14", placeholder: "13 or 14 digits" },
];

/** Pre-flight validator with friendly error messages so the user gets
 *  guidance before JsBarcode complains. */
function validate(value: string, format: BcFormat): string | null {
  const v = value.trim();
  if (!v) return "Enter a value to encode.";
  switch (format) {
    case "EAN13":
      if (!/^\d{12,13}$/.test(v))
        return "EAN-13 needs 12 or 13 digits — try CODE128 for free-form text.";
      return null;
    case "EAN8":
      if (!/^\d{7,8}$/.test(v))
        return "EAN-8 needs 7 or 8 digits.";
      return null;
    case "UPC":
      if (!/^\d{11,12}$/.test(v))
        return "UPC-A needs 11 or 12 digits.";
      return null;
    case "ITF14":
      if (!/^\d{13,14}$/.test(v))
        return "ITF-14 needs 13 or 14 digits.";
      return null;
    case "CODE39":
      if (!/^[A-Z0-9\-. $/+%]+$/.test(v))
        return "CODE39 supports A-Z, 0-9 and -. $/+% only.";
      return null;
    case "CODE128":
    default:
      return null;
  }
}

export function BarcodeSubPanel() {
  const addElement = useStudio((s) => s.addElement);
  const page = useActivePage();

  const [value, setValue] = useState<string>("123456789012");
  const [format, setFormat] = useState<BcFormat>("CODE128");
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Re-render whenever value or format changes.
  useEffect(() => {
    const fail = validate(value, format);
    if (fail) {
      setError(fail);
      setPreview(null);
      return;
    }
    setError(null);
    try {
      const canvas = document.createElement("canvas");
      JsBarcode(canvas, value.trim(), {
        format,
        width: 2,
        height: 100,
        margin: 10,
        displayValue: true,
        background: "#ffffff",
        lineColor: "#0b0b14",
        fontSize: 18,
      });
      setPreview(canvas.toDataURL("image/png"));
    } catch (e) {
      setPreview(null);
      setError(
        e instanceof Error
          ? `${e.message} — check the value matches the chosen format.`
          : "Failed to render barcode.",
      );
    }
  }, [value, format]);

  const insert = () => {
    if (!preview) return;
    const w = 600;
    const h = 180;
    const pageW = page?.width ?? 1280;
    const pageH = page?.height ?? 720;
    const el: Omit<ImageElement, "id"> = {
      type: "image",
      x: (pageW - w) / 2,
      y: (pageH - h) / 2,
      width: w,
      height: h,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      opacity: 1,
      src: preview,
    };
    addElement(el as Omit<ElementData, "id">);
  };

  const regenerate = () => {
    // Bump state to retrigger effect; if value already valid it just
    // re-renders the same barcode (gives the user a "nudge" button).
    setValue((v) => v);
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <BarcodeIcon className="h-5 w-5 text-purple-700" />
        <h3 className="text-base font-bold text-purple-950">Barcode</h3>
      </div>

      <label className="block">
        <span className="block text-xs font-semibold text-purple-800 mb-1">
          Value
        </span>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={FORMATS.find((f) => f.value === format)?.placeholder}
          spellCheck={false}
          className="w-full text-sm rounded-lg border border-purple-200 bg-white px-3 py-2 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-200 font-mono"
          data-testid="apps-barcode-input"
        />
      </label>

      <label className="block">
        <span className="block text-xs font-semibold text-purple-800 mb-1">
          Format
        </span>
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value as BcFormat)}
          className="w-full text-sm rounded-lg border border-purple-200 bg-white px-3 py-2 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
          data-testid="apps-barcode-format"
        >
          {FORMATS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        onClick={regenerate}
        className={cn(
          "w-full py-2 rounded-lg text-sm font-semibold text-amber-50",
          "bg-gradient-to-br from-purple-700 to-indigo-700 hover:from-purple-800 hover:to-indigo-800",
          "shadow-md shadow-purple-300/40 flex items-center justify-center gap-2",
        )}
        data-testid="apps-barcode-generate"
      >
        <Sparkles className="h-4 w-4" />
        Generate
      </button>

      {error && (
        <div
          className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2"
          data-testid="apps-barcode-error"
        >
          {error}
        </div>
      )}

      <div
        className="rounded-xl border-2 border-dashed border-purple-200 p-3 bg-white flex items-center justify-center min-h-[140px]"
        data-testid="apps-barcode-preview"
      >
        {preview ? (
          <img src={preview} alt="Barcode preview" className="max-w-full h-auto" />
        ) : (
          <span className="text-xs text-purple-500">
            Preview will appear here.
          </span>
        )}
      </div>

      {/* Hidden canvas slot kept for libraries that still need a DOM
          reference (we render off-screen above so no extra layout). */}
      <canvas ref={canvasRef} className="hidden" />

      <button
        type="button"
        onClick={insert}
        disabled={!preview}
        className="w-full py-2 rounded-lg text-sm font-semibold text-purple-900 bg-amber-300 hover:bg-amber-400 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
        data-testid="apps-barcode-insert"
      >
        Insert on canvas
      </button>
    </div>
  );
}
