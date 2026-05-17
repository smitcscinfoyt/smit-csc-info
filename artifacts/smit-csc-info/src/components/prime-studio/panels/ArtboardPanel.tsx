/**
 * Artboard panel — manual canvas-build tools that don't fit the
 * pre-built Elements / Text / Brand catalogs:
 *   1. Stroke Draw — freehand brush that paints a polyline on the
 *      canvas while pointer is down (toolMode="draw" + colour + size).
 *   2. Insert Table — generate a real grid of cells. After insert the
 *      panel keeps tracking the table so changing rows/cols/border/
 *      header-colour live-regenerates it. "Detach" stops tracking.
 *   3. Line Tool — armed via toolMode="line"; user drags two points
 *      on the canvas, weight + dash style come from this panel.
 *
 * The actual stroke / line creation lives in Stage.tsx (its pointer
 * handlers read `useStudio.getState().artboard` for the current
 * settings). This panel is the source of truth for those settings
 * and pushes them into the store on every change.
 */

import { useEffect, useRef, useState } from "react";
import {
  Brush,
  Table as TableIcon,
  Minus,
  Plus,
  Sparkles,
  Unlink2,
} from "lucide-react";
import { useStudio, useActivePage } from "../store";
import type { ElementData, RectElement, TextElement } from "../types";

/** Hard caps so a fat-fingered "999 rows" doesn't lock up Konva by
 *  spawning thousands of nodes. 20×20 is plenty for any real CSC form. */
const MAX_ROWS = 20;
const MAX_COLS = 20;

export function ArtboardPanel() {
  const page = useActivePage();
  const replaceElementsBatched = useStudio((s) => s.replaceElementsBatched);
  const toolMode = useStudio((s) => s.toolMode);
  const setToolMode = useStudio((s) => s.setToolMode);
  const setArtboardSettings = useStudio((s) => s.setArtboardSettings);

  // ── Stroke draw (synced to store via setArtboardSettings) ──────
  const [strokeColor, setStrokeColor] = useState("#7c3aed");
  const [brushSize, setBrushSize] = useState(8);
  const drawingEnabled = toolMode === "draw";

  // ── Table builder ──────────────────────────────────────────────
  const [tableRows, setTableRows] = useState(3);
  const [tableCols, setTableCols] = useState(3);
  const [tableBorderWidth, setTableBorderWidth] = useState(1);
  const [tableHeaderColor, setTableHeaderColor] = useState("#7c3aed");
  /** IDs of the cells (and header labels) belonging to the most
   *  recently inserted/synced table. While non-null, slider edits
   *  in this panel auto-regenerate that table in place. */
  const [trackedTableIds, setTrackedTableIds] = useState<string[] | null>(null);

  // ── Line tool ──────────────────────────────────────────────────
  const [lineWeight, setLineWeight] = useState(3);
  const [lineDashed, setLineDashed] = useState(false);
  const lineToolActive = toolMode === "line";

  // Push tool settings → store so Stage's pointer handlers can read
  // them when committing freehand strokes / line shapes. We don't
  // have to wait for a button click — every slider tweak updates the
  // store immediately so the next stroke uses fresh values.
  useEffect(() => {
    setArtboardSettings({
      drawColor: strokeColor,
      drawSize: brushSize,
      lineWeight,
      lineDashed,
    });
  }, [strokeColor, brushSize, lineWeight, lineDashed, setArtboardSettings]);

  /** Build the table payload for the current panel settings. Pure
   *  function of the inputs — used both for the initial Insert and
   *  for in-place re-syncs. */
  const buildTable = (): {
    elements: Array<Omit<ElementData, "id">>;
  } | null => {
    if (!page) return null;
    const rows = Math.max(1, Math.min(MAX_ROWS, Math.round(tableRows)));
    const cols = Math.max(1, Math.min(MAX_COLS, Math.round(tableCols)));
    const cellW = 120;
    const cellH = 44;
    const tableW = cols * cellW;
    const tableH = rows * cellH;
    const startX = (page.width - tableW) / 2;
    const startY = (page.height - tableH) / 2;
    const out: Array<Omit<ElementData, "id">> = [];
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const isHeader = r === 0;
        const cell: Omit<RectElement, "id"> = {
          type: "rect",
          x: startX + c * cellW,
          y: startY + r * cellH,
          width: cellW,
          height: cellH,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          opacity: 1,
          fill: isHeader ? tableHeaderColor : "#ffffff",
          stroke: "#374151",
          strokeWidth: tableBorderWidth,
        };
        out.push(cell as Omit<ElementData, "id">);
        if (isHeader) {
          const label: Omit<TextElement, "id"> = {
            type: "text",
            x: startX + c * cellW + 8,
            y: startY + r * cellH + 12,
            width: cellW - 16,
            height: cellH - 24,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
            opacity: 1,
            text: `Column ${c + 1}`,
            fontFamily: "Poppins",
            fontSize: 14,
            fontStyle: "bold",
            textDecoration: "",
            align: "center",
            fill: "#ffffff",
            lineHeight: 1.2,
            letterSpacing: 0,
          };
          out.push(label as Omit<ElementData, "id">);
        }
      }
    }
    return { elements: out };
  };

  /** Drop the previously-tracked table (if any) and add a freshly
   *  generated one — atomically, in ONE history snapshot. Returns
   *  the new element ids so callers can decide whether to keep
   *  tracking them. */
  const regenerateTable = (): string[] => {
    if (!page) return [];
    const built = buildTable();
    if (!built) return [];
    return replaceElementsBatched(trackedTableIds ?? [], built.elements);
  };

  const insertTable = () => {
    const ids = regenerateTable();
    setTrackedTableIds(ids);
  };

  const detachTable = () => setTrackedTableIds(null);

  // Live-sync the tracked table to settings. We debounce slightly so
  // dragging a slider doesn't fire 30 regenerations per second; the
  // last value the user lands on is what gets applied. When no table
  // is tracked this effect is a noop — costs nothing.
  // We DON'T include `trackedTableIds` itself in the dep array so
  // Insert -> setTrackedTableIds doesn't immediately fire a redundant
  // regen; only subsequent settings changes matter.
  const skipFirstSyncRef = useRef(true);
  useEffect(() => {
    if (skipFirstSyncRef.current) {
      skipFirstSyncRef.current = false;
      return;
    }
    if (!trackedTableIds || trackedTableIds.length === 0) return;
    const t = setTimeout(() => {
      const ids = regenerateTable();
      setTrackedTableIds(ids);
    }, 120);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableRows, tableCols, tableBorderWidth, tableHeaderColor]);

  return (
    <div className="p-4 space-y-5 animate-in fade-in slide-in-from-left-2 duration-200">
      <PanelHeader
        title="Artboard"
        subtitle="Manual canvas tools — draw, table, line"
      />

      {/* ── Stroke Draw ─────────────────────────────────────────── */}
      <ToolCard
        icon={<Brush className="h-4 w-4" />}
        title="Stroke Draw"
        accent="purple"
      >
        <ToggleRow
          label="Enable drawing mode"
          checked={drawingEnabled}
          onChange={(v) => setToolMode(v ? "draw" : "select")}
        />
        <FieldRow label="Brush colour">
          <ColorSwatch value={strokeColor} onChange={setStrokeColor} />
        </FieldRow>
        <FieldRow label={`Brush size · ${brushSize} px`}>
          <input
            type="range"
            min={1}
            max={50}
            value={brushSize}
            onChange={(e) => setBrushSize(Number(e.target.value))}
            className="w-full accent-purple-600"
            data-testid="artboard-brush-size"
          />
        </FieldRow>
        <HintLine>
          {drawingEnabled
            ? "Drawing is on — drag on the canvas to paint."
            : "Toggle on, then drag on the canvas to paint."}
        </HintLine>
      </ToolCard>

      {/* ── Table Tool ─────────────────────────────────────────── */}
      <ToolCard
        icon={<TableIcon className="h-4 w-4" />}
        title="Table"
        accent="amber"
      >
        <div className="grid grid-cols-2 gap-2">
          <FieldRow label="Rows" inline>
            <NumberStepper
              value={tableRows}
              min={1}
              max={MAX_ROWS}
              onChange={setTableRows}
            />
          </FieldRow>
          <FieldRow label="Columns" inline>
            <NumberStepper
              value={tableCols}
              min={1}
              max={MAX_COLS}
              onChange={setTableCols}
            />
          </FieldRow>
        </div>
        <FieldRow label={`Border thickness · ${tableBorderWidth} px`}>
          <input
            type="range"
            min={0}
            max={6}
            value={tableBorderWidth}
            onChange={(e) => setTableBorderWidth(Number(e.target.value))}
            className="w-full accent-purple-600"
          />
        </FieldRow>
        <FieldRow label="Header colour">
          <ColorSwatch
            value={tableHeaderColor}
            onChange={setTableHeaderColor}
          />
        </FieldRow>
        <PrimaryButton
          onClick={insertTable}
          icon={<Plus className="h-4 w-4" />}
          testId="artboard-insert-table"
        >
          {trackedTableIds ? "Replace Table" : "Insert Table"}
        </PrimaryButton>
        {trackedTableIds ? (
          <button
            type="button"
            onClick={detachTable}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-[11px] font-medium text-purple-700 hover:bg-purple-50 transition-colors"
            data-testid="artboard-detach-table"
          >
            <Unlink2 className="h-3 w-3" />
            Detach — stop syncing settings to this table
          </button>
        ) : null}
        <HintLine>
          {trackedTableIds
            ? "Slider tweaks update the inserted table instantly."
            : "Click Insert, then change settings to update the table."}
        </HintLine>
      </ToolCard>

      {/* ── Line Tool ──────────────────────────────────────────── */}
      <ToolCard
        icon={<Minus className="h-4 w-4 rotate-12" />}
        title="Line"
        accent="purple"
      >
        <FieldRow label={`Weight · ${lineWeight} px`}>
          <input
            type="range"
            min={1}
            max={20}
            value={lineWeight}
            onChange={(e) => setLineWeight(Number(e.target.value))}
            className="w-full accent-purple-600"
          />
        </FieldRow>
        <FieldRow label="Style">
          <div className="grid grid-cols-2 gap-2">
            <StyleChip
              active={!lineDashed}
              onClick={() => setLineDashed(false)}
              label="Solid"
            >
              <div
                className="w-full h-0 border-t-2 border-purple-700"
                style={{ borderStyle: "solid" }}
              />
            </StyleChip>
            <StyleChip
              active={lineDashed}
              onClick={() => setLineDashed(true)}
              label="Dashed"
            >
              <div
                className="w-full h-0 border-t-2 border-purple-700"
                style={{ borderStyle: "dashed" }}
              />
            </StyleChip>
          </div>
        </FieldRow>
        <PrimaryButton
          onClick={() => setToolMode(lineToolActive ? "select" : "line")}
          icon={<Sparkles className="h-4 w-4" />}
          variant={lineToolActive ? "active" : "primary"}
          testId="artboard-line-tool"
        >
          {lineToolActive ? "Line tool · Active" : "Draw a line"}
        </PrimaryButton>
        <HintLine>
          {lineToolActive
            ? "Drag two points on the canvas to draw a line."
            : "Click the button, then drag two points on the canvas."}
        </HintLine>
      </ToolCard>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────
 * UI atoms — kept in this file because they're tightly coupled to
 * the panel's premium look (rounded-xl, gradient header rows, soft
 * purple shadows). Hoisting them to a shared module would invite
 * style drift across panels that don't want this exact treatment.
 * ──────────────────────────────────────────────────────────────── */

function PanelHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="-mx-4 -mt-4 px-4 pt-4 pb-3 bg-gradient-to-br from-purple-900 via-purple-800 to-indigo-900 text-white rounded-b-2xl shadow-lg shadow-purple-900/20">
      <h3 className="text-base font-bold tracking-tight">{title}</h3>
      <p className="text-[11px] text-purple-100/80 mt-0.5">{subtitle}</p>
    </div>
  );
}

function ToolCard({
  icon,
  title,
  accent,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  accent: "purple" | "amber";
  children: React.ReactNode;
}) {
  const accentClasses =
    accent === "purple"
      ? "from-purple-100 to-indigo-50 text-purple-800 ring-purple-200"
      : "from-amber-100 to-orange-50 text-amber-800 ring-amber-200";
  return (
    <section className="rounded-xl border border-purple-100 bg-white shadow-sm shadow-purple-100/40 overflow-hidden transition-shadow hover:shadow-md hover:shadow-purple-200/40">
      <header
        className={`flex items-center gap-2 px-3 py-2 bg-gradient-to-r ${accentClasses} ring-1 ring-inset`}
      >
        <span className="grid place-items-center h-6 w-6 rounded-md bg-white/70 shadow-sm">
          {icon}
        </span>
        <h4 className="text-sm font-semibold tracking-tight">{title}</h4>
      </header>
      <div className="p-3 space-y-3">{children}</div>
    </section>
  );
}

function FieldRow({
  label,
  inline,
  children,
}: {
  label: string;
  inline?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={inline ? "space-y-1" : "space-y-1.5"}>
      <label className="text-[11px] font-medium text-purple-900/70 tracking-wide block">
        {label}
      </label>
      {children}
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="w-full flex items-center justify-between gap-3 px-2 py-1.5 rounded-lg hover:bg-purple-50 transition-colors"
      data-testid="artboard-draw-toggle"
    >
      <span className="text-xs font-medium text-purple-900">{label}</span>
      <span
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
          checked ? "bg-purple-600" : "bg-purple-200"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}

function ColorSwatch({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer group">
      <span
        className="h-8 w-8 rounded-lg border-2 border-white shadow ring-1 ring-purple-200 group-hover:ring-purple-400 transition"
        style={{ backgroundColor: value }}
      />
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="sr-only"
        aria-label="Pick a colour"
      />
      <span className="font-mono text-[11px] uppercase text-purple-900/70">
        {value}
      </span>
    </label>
  );
}

function NumberStepper({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  return (
    <div className="flex items-center rounded-lg border border-purple-200 overflow-hidden bg-white">
      <button
        type="button"
        onClick={() => onChange(clamp(value - 1))}
        className="px-2 py-1 text-purple-700 hover:bg-purple-50 transition-colors text-base leading-none"
        aria-label="Decrease"
      >
        −
      </button>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(clamp(Number(e.target.value) || min))}
        className="w-full text-center text-sm font-semibold text-purple-900 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button
        type="button"
        onClick={() => onChange(clamp(value + 1))}
        className="px-2 py-1 text-purple-700 hover:bg-purple-50 transition-colors text-base leading-none"
        aria-label="Increase"
      >
        +
      </button>
    </div>
  );
}

function StyleChip({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-1.5 py-2 px-2 rounded-lg border transition-all ${
        active
          ? "bg-gradient-to-br from-purple-700 to-indigo-700 border-purple-800 text-white shadow-md shadow-purple-300/40 scale-[1.02]"
          : "bg-white border-purple-200 text-purple-700 hover:bg-purple-50"
      }`}
    >
      <div className="w-full px-2">{children}</div>
      <span className="text-[10px] font-semibold tracking-wide">{label}</span>
    </button>
  );
}

function PrimaryButton({
  children,
  onClick,
  icon,
  variant = "primary",
  testId,
}: {
  children: React.ReactNode;
  onClick: () => void;
  icon?: React.ReactNode;
  variant?: "primary" | "active";
  testId?: string;
}) {
  const cls =
    variant === "active"
      ? "bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-md shadow-amber-300/40"
      : "bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-800 hover:to-indigo-800 text-white shadow-md shadow-purple-300/40";
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={`w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-semibold transition-all hover:scale-[1.01] active:scale-[0.99] ${cls}`}
    >
      {icon}
      {children}
    </button>
  );
}

function HintLine({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] text-purple-500/80 italic px-1">{children}</p>
  );
}
