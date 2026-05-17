/**
 * Page-level floating toolbar — shown above the canvas when no element
 * is selected. Lets the user change the page background colour, add /
 * duplicate / delete pages, and trigger the resize dialog.
 */

import { useStudio, useActivePage } from "../store";
import { Plus, Copy, Trash2, Palette } from "lucide-react";
import { useRef } from "react";

interface Props {
  onResize: () => void;
}

export function PageToolbar({ onResize: _onResize }: Props) {
  const selectedIds = useStudio((s) => s.selectedIds);
  const page = useActivePage();
  const setPageBackground = useStudio((s) => s.setPageBackground);
  const addPage = useStudio((s) => s.addPage);
  const duplicatePage = useStudio((s) => s.duplicatePage);
  const deletePage = useStudio((s) => s.deletePage);
  const pages = useStudio((s) => s.pages);
  const colorInputRef = useRef<HTMLInputElement>(null);

  // Hide when an element is selected (ContextualToolbar takes over).
  if (selectedIds.length > 0 || !page) return null;

  return (
    <div
      className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 bg-white rounded-xl shadow-lg border border-purple-200 px-2 py-1.5"
      data-testid="page-toolbar"
    >
      <span className="px-2 text-xs font-semibold text-purple-700 hidden sm:inline">
        Page
      </span>

      {/* Background colour — single gradient swatch acts as the picker */}
      <div className="flex items-center gap-1 px-1 border-r border-purple-100 pr-2">
        <button
          type="button"
          onClick={() => colorInputRef.current?.click()}
          className="h-8 w-8 rounded-md ring-2 ring-purple-300 hover:ring-purple-600 transition-all flex items-center justify-center shadow-sm"
          style={{
            background:
              "conic-gradient(from 180deg at 50% 50%, #ef4444, #f59e0b, #facc15, #22c55e, #06b6d4, #3b82f6, #8b5cf6, #ec4899, #ef4444)",
          }}
          title="Page background colour"
          data-testid="page-bg-color"
        >
          <Palette className="h-3.5 w-3.5 text-white drop-shadow" />
        </button>
        <input
          ref={colorInputRef}
          type="color"
          value={page.background}
          onChange={(e) => setPageBackground(page.id, e.target.value)}
          className="sr-only"
          aria-label="Page background colour picker"
        />
      </div>

      <button
        type="button"
        onClick={() => addPage()}
        className="h-8 w-8 rounded-md hover:bg-purple-50 text-purple-700 flex items-center justify-center"
        title="Add new page"
        data-testid="page-add"
      >
        <Plus className="h-4 w-4" />
      </button>

      <button
        type="button"
        onClick={() => duplicatePage(page.id)}
        className="h-8 w-8 rounded-md hover:bg-purple-50 text-purple-700 flex items-center justify-center"
        title="Duplicate page"
        data-testid="page-duplicate"
      >
        <Copy className="h-4 w-4" />
      </button>

      <button
        type="button"
        onClick={() => {
          if (pages.length <= 1) {
            alert("Cannot delete the last page.");
            return;
          }
          if (confirm("Delete this page?")) deletePage(page.id);
        }}
        disabled={pages.length <= 1}
        className="h-8 w-8 rounded-md hover:bg-red-50 text-red-600 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center"
        title="Delete page"
        data-testid="page-delete"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
