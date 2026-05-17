/**
 * Layers panel — lists every element on the active page (top-most first).
 * Click to select, eye to toggle visibility, lock to prevent edits, arrows
 * to reorder, trash to delete. Mirrors Canva's "Position" → list view.
 */

import { useStudio, useActivePage } from "../store";
import {
  Eye,
  EyeOff,
  Lock,
  Unlock,
  ChevronUp,
  ChevronDown,
  Trash2,
  Type as TypeIcon,
  Square,
  Circle,
  Image as ImageIcon,
  Minus,
  Sparkles,
} from "lucide-react";
import type { ElementData } from "../types";

function iconFor(el: ElementData) {
  switch (el.type) {
    case "text": return TypeIcon;
    case "rect": return Square;
    case "circle": return Circle;
    case "image": return ImageIcon;
    case "line": return Minus;
    case "icon": return Sparkles;
    default: return Square;
  }
}

function labelFor(el: ElementData): string {
  if (el.type === "text") return el.text.slice(0, 24) || "Text";
  if (el.type === "image") return "Image";
  if (el.type === "icon") return "Icon";
  if (el.type === "rect") return "Rectangle";
  if (el.type === "circle") return "Circle";
  if (el.type === "line") return "Line";
  return "Element";
}

export function LayersPanel() {
  const page = useActivePage();
  const selectedIds = useStudio((s) => s.selectedIds);
  const setSelected = useStudio((s) => s.setSelected);
  const updateElement = useStudio((s) => s.commitUpdateElement);
  const reorderElement = useStudio((s) => s.reorderElement);
  const deleteElements = useStudio((s) => s.deleteElements);

  if (!page) {
    return (
      <div className="p-4 text-sm text-purple-700">No active page.</div>
    );
  }

  // Render top-most first (highest z-index = end of array).
  const ordered = [...page.elements].reverse();

  return (
    <div className="p-4 space-y-3">
      <div>
        <h3 className="text-base font-bold text-purple-950">Layers</h3>
        <p className="text-xs text-purple-700">
          Top of list = front of canvas. Click a layer to select it.
        </p>
      </div>

      {ordered.length === 0 && (
        <div className="text-center py-10 text-purple-500 text-sm">
          No layers yet. Add elements from the left sidebar.
        </div>
      )}

      <div className="space-y-1">
        {ordered.map((el) => {
          const Icon = iconFor(el);
          const selected = selectedIds.includes(el.id);
          return (
            <div
              key={el.id}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest("[data-row-action]")) return;
                setSelected(e.shiftKey ? [...selectedIds, el.id] : [el.id]);
              }}
              className={`flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors ${
                selected
                  ? "bg-purple-100 ring-1 ring-purple-400"
                  : "hover:bg-purple-50"
              }`}
              data-testid={`layer-row-${el.id}`}
            >
              <Icon className="h-4 w-4 text-purple-700 shrink-0" />
              <span
                className={`flex-1 text-sm truncate ${
                  el.hidden ? "text-purple-400 line-through" : "text-purple-950"
                }`}
                title={labelFor(el)}
              >
                {labelFor(el)}
              </span>

              <button
                type="button"
                data-row-action
                onClick={() => reorderElement(el.id, "forward")}
                className="p-1 hover:bg-purple-200 rounded text-purple-700"
                title="Move up"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                data-row-action
                onClick={() => reorderElement(el.id, "backward")}
                className="p-1 hover:bg-purple-200 rounded text-purple-700"
                title="Move down"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                data-row-action
                onClick={() => updateElement(el.id, { hidden: !el.hidden })}
                className="p-1 hover:bg-purple-200 rounded text-purple-700"
                title={el.hidden ? "Show" : "Hide"}
              >
                {el.hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                data-row-action
                onClick={() => updateElement(el.id, { locked: !el.locked })}
                className="p-1 hover:bg-purple-200 rounded text-purple-700"
                title={el.locked ? "Unlock" : "Lock"}
              >
                {el.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                data-row-action
                onClick={() => deleteElements([el.id])}
                className="p-1 hover:bg-rose-100 rounded text-rose-600"
                title="Delete"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
