/**
 * Apps & Add-ons → Calendar sub-panel.
 *
 * Builds a 7-column month calendar to an off-screen 800×600 canvas with
 * weekend cells tinted gold and today highlighted with a purple ring.
 * English / Gujarati labels via the studio's bundled Noto Sans Gujarati.
 */

import { useEffect, useRef, useState } from "react";
import { CalendarDays, Sparkles } from "lucide-react";
import { useStudio, useActivePage } from "../../store";
import type { ElementData, ImageElement } from "../../types";
import { loadGoogleFont } from "../../fonts/catalog";
import { cn } from "@/lib/utils";

type Lang = "en" | "gu";

const MONTHS_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTHS_GU = [
  "જાન્યુઆરી", "ફેબ્રુઆરી", "માર્ચ", "એપ્રિલ", "મે", "જૂન",
  "જુલાઈ", "ઑગસ્ટ", "સપ્ટેમ્બર", "ઑક્ટોબર", "નવેમ્બર", "ડિસેમ્બર",
];
const DOW_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DOW_GU = ["રવિ", "સોમ", "મંગળ", "બુધ", "ગુરુ", "શુક્ર", "શનિ"];
const DIGITS_GU = ["૦", "૧", "૨", "૩", "૪", "૫", "૬", "૭", "૮", "૯"];

function toGujaratiDigits(n: number): string {
  return String(n)
    .split("")
    .map((c) => (c >= "0" && c <= "9" ? DIGITS_GU[Number(c)] : c))
    .join("");
}

function formatNum(n: number, lang: Lang): string {
  return lang === "gu" ? toGujaratiDigits(n) : String(n);
}

const CANVAS_W = 800;
const CANVAS_H = 600;
const PURPLE = "#7c3aed";
const PURPLE_DARK = "#4c1d95";
const GOLD = "#facc15";
const GOLD_SOFT = "#fef3c7";
const TEXT = "#0b0b14";
const MUTED = "#9ca3af";

interface DrawArgs {
  year: number;
  month: number; // 0-11
  lang: Lang;
}

function drawCalendar(canvas: HTMLCanvasElement, { year, month, lang }: DrawArgs): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;

  // Background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  const fontFamily =
    lang === "gu" ? "'Noto Sans Gujarati', 'Inter', sans-serif" : "'Inter', sans-serif";

  // Title bar
  const titleH = 80;
  ctx.fillStyle = PURPLE_DARK;
  ctx.fillRect(0, 0, CANVAS_W, titleH);
  ctx.fillStyle = "#fef3c7";
  ctx.font = `700 36px ${fontFamily}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const monthName = lang === "gu" ? MONTHS_GU[month] : MONTHS_EN[month];
  ctx.fillText(`${monthName} ${formatNum(year, lang)}`, CANVAS_W / 2, titleH / 2);

  // Day-of-week header
  const dowH = 50;
  const dowY = titleH;
  ctx.fillStyle = GOLD_SOFT;
  ctx.fillRect(0, dowY, CANVAS_W, dowH);
  const colW = CANVAS_W / 7;
  ctx.font = `600 18px ${fontFamily}`;
  const dowLabels = lang === "gu" ? DOW_GU : DOW_EN;
  for (let i = 0; i < 7; i++) {
    const isWeekend = i === 0 || i === 6;
    ctx.fillStyle = isWeekend ? PURPLE_DARK : TEXT;
    ctx.fillText(dowLabels[i], colW * i + colW / 2, dowY + dowH / 2);
  }

  // Cells grid (6 rows)
  const gridY = dowY + dowH;
  const gridH = CANVAS_H - gridY;
  const rows = 6;
  const rowH = gridH / rows;

  const firstOfMonth = new Date(year, month, 1);
  const startDow = firstOfMonth.getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();

  const today = new Date();
  const isCurrentMonth =
    today.getFullYear() === year && today.getMonth() === month;
  const todayDate = today.getDate();

  // Faint grid lines
  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 1;
  for (let r = 1; r < rows; r++) {
    ctx.beginPath();
    ctx.moveTo(0, gridY + r * rowH);
    ctx.lineTo(CANVAS_W, gridY + r * rowH);
    ctx.stroke();
  }
  for (let c = 1; c < 7; c++) {
    ctx.beginPath();
    ctx.moveTo(c * colW, gridY);
    ctx.lineTo(c * colW, CANVAS_H);
    ctx.stroke();
  }

  // Weekend column tint
  ctx.fillStyle = "rgba(250, 204, 21, 0.10)";
  ctx.fillRect(0, gridY, colW, gridH);
  ctx.fillRect(colW * 6, gridY, colW, gridH);

  // Day numbers
  ctx.font = `500 22px ${fontFamily}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (let cell = 0; cell < rows * 7; cell++) {
    const row = Math.floor(cell / 7);
    const col = cell % 7;
    const cx = col * colW + colW / 2;
    const cy = gridY + row * rowH + rowH / 2;

    let dayNum: number;
    let inMonth = true;
    const seq = cell - startDow + 1;
    if (seq < 1) {
      dayNum = prevMonthDays + seq;
      inMonth = false;
    } else if (seq > daysInMonth) {
      dayNum = seq - daysInMonth;
      inMonth = false;
    } else {
      dayNum = seq;
    }

    const isToday = inMonth && isCurrentMonth && dayNum === todayDate;

    if (isToday) {
      ctx.beginPath();
      ctx.fillStyle = PURPLE;
      ctx.arc(cx, cy, Math.min(rowH, colW) * 0.32, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fef3c7";
    } else if (!inMonth) {
      ctx.fillStyle = MUTED;
    } else if (col === 0 || col === 6) {
      ctx.fillStyle = PURPLE_DARK;
    } else {
      ctx.fillStyle = TEXT;
    }

    ctx.fillText(formatNum(dayNum, lang), cx, cy);
  }

  // Outer border
  ctx.strokeStyle = PURPLE;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, CANVAS_W - 2, CANVAS_H - 2);
}

export function CalendarSubPanel() {
  const addElement = useStudio((s) => s.addElement);
  const page = useActivePage();
  const today = new Date();

  const [year, setYear] = useState<number>(today.getFullYear());
  const [month, setMonth] = useState<number>(today.getMonth());
  const [lang, setLang] = useState<Lang>("en");
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Load Gujarati font lazily.
  useEffect(() => {
    if (lang === "gu") {
      void loadGoogleFont("Noto Sans Gujarati", [400, 600, 700]);
    }
  }, [lang]);

  const generate = async () => {
    setError(null);
    setBusy(true);
    try {
      if (lang === "gu") {
        await loadGoogleFont("Noto Sans Gujarati", [400, 600, 700]);
      }
      const canvas = canvasRef.current ?? document.createElement("canvas");
      drawCalendar(canvas, { year, month, lang });
      setPreview(canvas.toDataURL("image/png"));
    } catch (e) {
      setPreview(null);
      setError(e instanceof Error ? e.message : "Failed to render calendar.");
    } finally {
      setBusy(false);
    }
  };

  // Auto-render whenever inputs change (small debounce so font swap settles).
  useEffect(() => {
    const t = window.setTimeout(() => {
      void generate();
    }, 150);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, lang]);

  const insert = () => {
    if (!preview) return;
    const w = 800;
    const h = 600;
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

  const monthOptions = (lang === "gu" ? MONTHS_GU : MONTHS_EN).map((name, i) => ({
    name,
    value: i,
  }));

  // Year range: ±10 from today.
  const baseYear = today.getFullYear();
  const years: number[] = [];
  for (let y = baseYear - 10; y <= baseYear + 10; y++) years.push(y);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <CalendarDays className="h-5 w-5 text-purple-700" />
        <h3 className="text-base font-bold text-purple-950">Calendar</h3>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-xs font-semibold text-purple-800 mb-1">
            Month
          </span>
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="w-full text-sm rounded-lg border border-purple-200 bg-white px-3 py-2 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
            data-testid="apps-cal-month"
          >
            {monthOptions.map((m) => (
              <option key={m.value} value={m.value}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs font-semibold text-purple-800 mb-1">
            Year
          </span>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="w-full text-sm rounded-lg border border-purple-200 bg-white px-3 py-2 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
            data-testid="apps-cal-year"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {formatNum(y, lang)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div>
        <span className="block text-xs font-semibold text-purple-800 mb-1">
          Language
        </span>
        <div
          className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-purple-50 border border-purple-200"
          role="tablist"
        >
          {[
            { id: "en" as Lang, label: "English" },
            { id: "gu" as Lang, label: "ગુજરાતી" },
          ].map((opt) => {
            const active = lang === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setLang(opt.id)}
                className={cn(
                  "py-1.5 rounded-md text-xs font-bold transition-colors",
                  active
                    ? "bg-gradient-to-br from-purple-700 to-indigo-700 text-amber-50 shadow-sm"
                    : "text-purple-700 hover:bg-purple-100",
                )}
                data-testid={`apps-cal-lang-${opt.id}`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={() => void generate()}
        disabled={busy}
        className="w-full py-2 rounded-lg text-sm font-semibold text-amber-50 bg-gradient-to-br from-purple-700 to-indigo-700 hover:from-purple-800 hover:to-indigo-800 shadow-md shadow-purple-300/40 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        data-testid="apps-cal-generate"
      >
        <Sparkles className="h-4 w-4" />
        {busy ? "Rendering…" : "Refresh preview"}
      </button>

      {error && (
        <div
          className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2"
          data-testid="apps-cal-error"
        >
          {error}
        </div>
      )}

      <div
        className="rounded-xl border-2 border-dashed border-purple-200 p-2 bg-white flex items-center justify-center"
        data-testid="apps-cal-preview"
      >
        {preview ? (
          <img
            src={preview}
            alt="Calendar preview"
            className="w-full h-auto rounded"
            style={{ aspectRatio: `${CANVAS_W} / ${CANVAS_H}` }}
          />
        ) : (
          <span className="text-xs text-purple-500 py-12">Preview will appear here.</span>
        )}
      </div>

      {/* Hidden working canvas. */}
      <canvas ref={canvasRef} className="hidden" />

      <button
        type="button"
        onClick={insert}
        disabled={!preview}
        className="w-full py-2 rounded-lg text-sm font-semibold text-purple-900 bg-amber-300 hover:bg-amber-400 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
        data-testid="apps-cal-insert"
      >
        Insert on canvas
      </button>
    </div>
  );
}
