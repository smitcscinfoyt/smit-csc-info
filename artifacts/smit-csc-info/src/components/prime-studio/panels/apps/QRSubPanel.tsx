/**
 * Apps & Add-ons → QR sub-panel.
 *
 * Generates a QR code (PNG data-URL) from a text/URL value with
 * configurable error-correction level and foreground/background colours.
 * "Insert on canvas" places it as a 320×320 image element centred on
 * the active page.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import * as QRCode from "qrcode";
import { QrCode, Sparkles } from "lucide-react";
import { useStudio, useActivePage } from "../../store";
import type { ElementData, ImageElement } from "../../types";
import { cn } from "@/lib/utils";

type EcLevel = "L" | "M" | "Q" | "H";

const EC_LEVELS: { value: EcLevel; label: string; hint: string }[] = [
  { value: "L", label: "L", hint: "Low (~7%)" },
  { value: "M", label: "M", hint: "Medium (~15%)" },
  { value: "Q", label: "Q", hint: "Quartile (~25%)" },
  { value: "H", label: "H", hint: "High (~30%)" },
];

export function QRSubPanel() {
  const addElement = useStudio((s) => s.addElement);
  const page = useActivePage();

  const [value, setValue] = useState<string>("https://");
  const [ec, setEc] = useState<EcLevel>("M");
  const [fg, setFg] = useState<string>("#0b0b14");
  const [bg, setBg] = useState<string>("#ffffff");
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const tokenRef = useRef(0);

  const trimmed = value.trim();
  const canGenerate = trimmed.length > 0;

  const generate = async () => {
    if (!canGenerate) {
      setError("Enter a URL or text first.");
      setPreview(null);
      return;
    }
    setError(null);
    setBusy(true);
    const myToken = ++tokenRef.current;
    try {
      const url = await QRCode.toDataURL(trimmed, {
        errorCorrectionLevel: ec,
        margin: 1,
        scale: 8,
        color: { dark: fg, light: bg },
      });
      if (myToken === tokenRef.current) setPreview(url);
    } catch (e) {
      if (myToken === tokenRef.current) {
        setPreview(null);
        setError(e instanceof Error ? e.message : "Failed to generate QR.");
      }
    } finally {
      if (myToken === tokenRef.current) setBusy(false);
    }
  };

  // Auto-regenerate on any input change (debounced).
  useEffect(() => {
    if (!canGenerate) {
      setPreview(null);
      return;
    }
    const t = window.setTimeout(() => {
      void generate();
    }, 200);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmed, ec, fg, bg]);

  const insert = () => {
    if (!preview) return;
    const w = 320;
    const h = 320;
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

  const previewBg = useMemo(() => bg, [bg]);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <QrCode className="h-5 w-5 text-purple-700" />
        <h3 className="text-base font-bold text-purple-950">QR generator</h3>
      </div>

      <label className="block">
        <span className="block text-xs font-semibold text-purple-800 mb-1">
          URL or text
        </span>
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={3}
          spellCheck={false}
          className="w-full text-sm rounded-lg border border-purple-200 bg-white px-3 py-2 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-200 resize-none"
          data-testid="apps-qr-input"
        />
      </label>

      <div>
        <span className="block text-xs font-semibold text-purple-800 mb-1">
          Error correction
        </span>
        <div className="grid grid-cols-4 gap-1 p-1 rounded-lg bg-purple-50 border border-purple-200">
          {EC_LEVELS.map((lvl) => {
            const active = ec === lvl.value;
            return (
              <button
                key={lvl.value}
                type="button"
                title={lvl.hint}
                onClick={() => setEc(lvl.value)}
                className={cn(
                  "py-1.5 rounded-md text-xs font-bold transition-colors",
                  active
                    ? "bg-gradient-to-br from-purple-700 to-indigo-700 text-amber-50 shadow-sm"
                    : "text-purple-700 hover:bg-purple-100",
                )}
                data-testid={`apps-qr-ec-${lvl.value}`}
              >
                {lvl.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-xs font-semibold text-purple-800 mb-1">
            Foreground
          </span>
          <div className="flex items-center gap-2 rounded-lg border border-purple-200 bg-white px-2 py-1.5">
            <input
              type="color"
              value={fg}
              onChange={(e) => setFg(e.target.value)}
              className="h-7 w-7 rounded cursor-pointer border-0 bg-transparent"
              data-testid="apps-qr-color-fg"
            />
            <span className="text-xs font-mono text-purple-800">{fg}</span>
          </div>
        </label>
        <label className="block">
          <span className="block text-xs font-semibold text-purple-800 mb-1">
            Background
          </span>
          <div className="flex items-center gap-2 rounded-lg border border-purple-200 bg-white px-2 py-1.5">
            <input
              type="color"
              value={bg}
              onChange={(e) => setBg(e.target.value)}
              className="h-7 w-7 rounded cursor-pointer border-0 bg-transparent"
              data-testid="apps-qr-color-bg"
            />
            <span className="text-xs font-mono text-purple-800">{bg}</span>
          </div>
        </label>
      </div>

      <button
        type="button"
        onClick={() => void generate()}
        disabled={!canGenerate || busy}
        className="w-full py-2 rounded-lg text-sm font-semibold text-amber-50 bg-gradient-to-br from-purple-700 to-indigo-700 hover:from-purple-800 hover:to-indigo-800 shadow-md shadow-purple-300/40 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        data-testid="apps-qr-generate"
      >
        <Sparkles className="h-4 w-4" />
        {busy ? "Generating…" : "Generate"}
      </button>

      {error && (
        <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2">
          {error}
        </div>
      )}

      <div
        className="rounded-xl border-2 border-dashed border-purple-200 p-3 flex items-center justify-center min-h-[200px]"
        style={{ background: previewBg }}
        data-testid="apps-qr-preview"
      >
        {preview ? (
          <img
            src={preview}
            alt="QR preview"
            className="w-[180px] h-[180px] object-contain"
          />
        ) : (
          <span className="text-xs text-purple-500">Preview will appear here.</span>
        )}
      </div>

      <button
        type="button"
        onClick={insert}
        disabled={!preview}
        className="w-full py-2 rounded-lg text-sm font-semibold text-purple-900 bg-amber-300 hover:bg-amber-400 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
        data-testid="apps-qr-insert"
      >
        Insert on canvas
      </button>
    </div>
  );
}
