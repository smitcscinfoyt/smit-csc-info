/**
 * Prime Studio top bar — File / Resize / Editing menus on the left,
 * project title in the centre, Share + Export buttons on the right.
 * Royal-purple gradient mirrors the Canva screenshot the user provided.
 */

import { useState } from "react";
import { ChevronLeft, Crown, Download, Undo2, Redo2, Save, Menu, FileText, Sparkles, Loader2 } from "lucide-react";
import { Link } from "wouter";

function Loader2Spin() {
  return <Loader2 className="relative h-4 w-4 animate-spin" />;
}
import { useStudio } from "../store";
import { downloadProject, exportPng, exportJpeg, exportPdf } from "../export";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";

interface Props {
  onResize: () => void;
}

export function TopBar({ onResize }: Props) {
  const project = useStudio((s) => s.project);
  const undo = useStudio((s) => s.undo);
  const redo = useStudio((s) => s.redo);
  const past = useStudio((s) => s.past.length);
  const future = useStudio((s) => s.future.length);
  const exportProject = useStudio((s) => s.exportProject);
  const [exporting, setExporting] = useState<string | null>(null);

  const doExport = async (kind: "png" | "jpg" | "png-transparent" | "pdf" | "json") => {
    setExporting(kind);
    try {
      if (kind === "json") downloadProject(exportProject());
      else if (kind === "png") await exportPng(false);
      else if (kind === "png-transparent") await exportPng(true);
      else if (kind === "jpg") await exportJpeg();
      else if (kind === "pdf") await exportPdf();
    } catch (e) {
      console.error("[Prime Studio] export failed:", e);
      alert("Export failed: " + (e as Error).message);
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="h-12 shrink-0 bg-gradient-to-r from-purple-700 via-purple-700 to-indigo-700 text-white flex items-center px-3 gap-2 border-b border-purple-900 shadow">
      <Link href="/tools">
        <a className="flex items-center gap-1 text-amber-200 hover:text-amber-100 text-sm font-semibold mr-2" data-testid="back-to-tools">
          <ChevronLeft className="h-4 w-4" />
          Tools
        </a>
      </Link>

      <div className="flex items-center gap-1.5 bg-amber-400/20 border border-amber-400/40 px-2 py-0.5 rounded-md">
        <Crown className="h-3.5 w-3.5 text-amber-300" />
        <span className="text-xs font-bold text-amber-200">PRIME STUDIO</span>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger className="px-2 py-1 hover:bg-white/10 rounded text-sm font-medium">
          File
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>{project.title}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => doExport("json")}>
            <Save className="h-4 w-4 mr-2" /> Save (download .json)
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Download className="h-4 w-4 mr-2" /> Download
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem onClick={() => doExport("png")}>PNG (high-res)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => doExport("png-transparent")}>PNG (transparent)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => doExport("jpg")}>JPG (300 DPI)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => doExport("pdf")}>PDF (multi-page)</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>

      <button onClick={onResize} className="px-2 py-1 hover:bg-white/10 rounded text-sm font-medium">
        Resize
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger className="px-2 py-1 hover:bg-white/10 rounded text-sm font-medium flex items-center gap-1">
          <Menu className="h-3.5 w-3.5" /> Editing
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={undo} disabled={!past}>
            <Undo2 className="h-4 w-4 mr-2" /> Undo {past ? `(${past})` : ""}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={redo} disabled={!future}>
            <Redo2 className="h-4 w-4 mr-2" /> Redo {future ? `(${future})` : ""}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="flex-1" />

      <button
        onClick={undo}
        disabled={!past}
        className="p-1.5 hover:bg-white/10 rounded disabled:opacity-30"
        title="Undo"
        data-testid="btn-undo"
      >
        <Undo2 className="h-4 w-4" />
      </button>
      <button
        onClick={redo}
        disabled={!future}
        className="p-1.5 hover:bg-white/10 rounded disabled:opacity-30"
        title="Redo"
        data-testid="btn-redo"
      >
        <Redo2 className="h-4 w-4" />
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={!!exporting}
          className="group relative ml-2 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-purple-950
                     bg-gradient-to-b from-amber-300 via-amber-400 to-yellow-500
                     ring-1 ring-amber-200/80 shadow-[0_4px_14px_rgba(245,158,11,0.45),inset_0_1px_0_rgba(255,255,255,0.55)]
                     hover:from-amber-200 hover:via-amber-300 hover:to-yellow-400
                     hover:shadow-[0_6px_20px_rgba(245,158,11,0.6),inset_0_1px_0_rgba(255,255,255,0.7)]
                     active:translate-y-px active:shadow-[0_2px_8px_rgba(245,158,11,0.4),inset_0_1px_0_rgba(255,255,255,0.4)]
                     disabled:opacity-50 disabled:cursor-not-allowed
                     transition-all duration-150 ease-out
                     focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 focus-visible:ring-offset-2 focus-visible:ring-offset-purple-900"
          data-testid="btn-export"
          aria-label="Export design"
        >
          {/* glossy top highlight */}
          <span aria-hidden className="pointer-events-none absolute inset-x-1 top-px h-1/2 rounded-t-md bg-gradient-to-b from-white/55 to-transparent" />
          {exporting ? (
            <>
              <Loader2Spin />
              <span className="relative">Exporting…</span>
            </>
          ) : (
            <>
              <Download className="relative h-4 w-4 drop-shadow-[0_1px_0_rgba(255,255,255,0.6)]" />
              <span className="relative tracking-wide">Export</span>
              <Sparkles className="relative h-3.5 w-3.5 text-purple-900/70 group-hover:text-purple-900 group-hover:rotate-12 transition-transform" />
            </>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Download as</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => doExport("pdf")}>
            <FileText className="h-4 w-4 mr-2" /> PDF (multi-page, 300 DPI)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => doExport("png")}>
            PNG (high resolution)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => doExport("png-transparent")}>
            PNG (transparent background)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => doExport("jpg")}>
            JPG (high-res, smaller file)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
