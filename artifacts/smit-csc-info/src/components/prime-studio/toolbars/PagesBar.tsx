/**
 * Bottom multi-page bar — shows page thumbnails with active highlight,
 * Add Page / Duplicate / Delete actions, and the current zoom slider.
 */

import { useState } from "react";
import { Plus, Copy, Trash2, Hand, MousePointer2, ZoomIn, ZoomOut, Minimize2 } from "lucide-react";
import { useStudio } from "../store";

export function PagesBar() {
  const pages = useStudio((s) => s.pages);
  const activePageId = useStudio((s) => s.activePageId);
  const setActivePage = useStudio((s) => s.setActivePage);
  const addPage = useStudio((s) => s.addPage);
  const duplicatePage = useStudio((s) => s.duplicatePage);
  const deletePage = useStudio((s) => s.deletePage);
  const zoom = useStudio((s) => s.zoom);
  const setZoom = useStudio((s) => s.setZoom);
  const toolMode = useStudio((s) => s.toolMode);
  const setToolMode = useStudio((s) => s.setToolMode);
  const [thumbsOpen, setThumbsOpen] = useState(false);

  const activeIdx = pages.findIndex((p) => p.id === activePageId);

  return (
    <>
      {thumbsOpen && (
        <div className="absolute bottom-12 left-0 right-0 bg-white border-t border-purple-200 shadow-lg p-3 z-30 max-h-48 overflow-x-auto">
          <div className="flex gap-3 items-center">
            {pages.map((p, i) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setActivePage(p.id)}
                className={`shrink-0 relative rounded-md border-2 transition-all ${
                  p.id === activePageId
                    ? "border-amber-400 ring-2 ring-amber-200"
                    : "border-purple-200 hover:border-purple-400"
                }`}
                style={{ width: 110, height: 110 * (p.height / p.width) }}
              >
                <div className="absolute inset-0 rounded-sm" style={{ background: p.background }} />
                <div className="absolute -top-2 -left-2 bg-purple-700 text-white text-[10px] font-bold rounded-full h-5 w-5 flex items-center justify-center">
                  {i + 1}
                </div>
              </button>
            ))}
            <button
              type="button"
              onClick={addPage}
              className="shrink-0 h-24 w-32 rounded-md border-2 border-dashed border-purple-300 hover:border-purple-500 hover:bg-purple-50 flex items-center justify-center text-purple-600"
            >
              <Plus className="h-5 w-5" />
              <span className="text-xs ml-1 font-semibold">Add page</span>
            </button>
          </div>
        </div>
      )}

      <div className="h-12 shrink-0 bg-white border-t border-purple-200 flex items-center px-3 gap-2 text-purple-900">
        <button
          type="button"
          onClick={() => setToolMode(toolMode === "hand" ? "select" : "hand")}
          className={`p-1.5 rounded ${toolMode === "hand" ? "bg-purple-200" : "hover:bg-purple-100"}`}
          title="Hand tool (pan)"
          data-testid="btn-hand"
        >
          {toolMode === "hand" ? <Hand className="h-4 w-4" /> : <MousePointer2 className="h-4 w-4" />}
        </button>
        <span className="mx-1 h-5 w-px bg-purple-200" />

        <button
          type="button"
          onClick={() => setThumbsOpen((v) => !v)}
          className="text-sm font-semibold flex items-center gap-1 hover:bg-purple-100 px-2 py-1 rounded"
          data-testid="btn-pages"
        >
          📄 Pages {activeIdx + 1}/{pages.length}
        </button>

        <button onClick={addPage} className="p-1.5 hover:bg-purple-100 rounded" title="Add page">
          <Plus className="h-4 w-4" />
        </button>
        <button onClick={() => duplicatePage(activePageId)} className="p-1.5 hover:bg-purple-100 rounded" title="Duplicate page">
          <Copy className="h-4 w-4" />
        </button>
        <button
          onClick={() => deletePage(activePageId)}
          disabled={pages.length <= 1}
          className="p-1.5 hover:bg-rose-100 rounded text-rose-700 disabled:opacity-30"
          title="Delete page"
        >
          <Trash2 className="h-4 w-4" />
        </button>

        <div className="flex-1" />

        <button onClick={() => setZoom(zoom / 1.25)} className="p-1.5 hover:bg-purple-100 rounded" title="Zoom out">
          <ZoomOut className="h-4 w-4" />
        </button>
        <input
          type="range"
          min={10}
          max={400}
          value={Math.round(zoom * 100)}
          onChange={(e) => setZoom(+e.target.value / 100)}
          className="w-32 accent-purple-600"
        />
        <span className="text-xs font-semibold w-12 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom(zoom * 1.25)} className="p-1.5 hover:bg-purple-100 rounded" title="Zoom in">
          <ZoomIn className="h-4 w-4" />
        </button>
        <button onClick={() => setZoom(0.56)} className="p-1.5 hover:bg-purple-100 rounded" title="Fit">
          <Minimize2 className="h-4 w-4" />
        </button>
      </div>
    </>
  );
}
