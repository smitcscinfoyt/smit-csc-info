import { Link } from "wouter";
import { ChevronLeft, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ReactNode } from "react";
import type { ToolMeta } from "./tools-data";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface ToolLayoutProps {
  tool: ToolMeta;
  children: ReactNode;
  sidebar?: ReactNode;
  /** When true, drop the right info column (sidebar + "100% Private" card)
   *  and let the main content span the full width. Use for editor tools
   *  once a file is loaded, so the canvas + toolbar use the entire page
   *  instead of being squeezed by a 320-px informational rail. */
  fullBleed?: boolean;
}

export function ToolLayout({ tool, children, sidebar, fullBleed = false }: ToolLayoutProps) {
  const Icon = tool.icon;
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-violet-50/40 via-white to-white">
      <div
        className={`container mx-auto px-3 sm:px-4 py-3 sm:py-6 md:py-10 ${
          fullBleed ? "max-w-[1400px]" : "max-w-6xl"
        }`}
      >
        <Link
          href="/tools"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-indigo-600 mb-2 sm:mb-4"
        >
          <ChevronLeft className="h-4 w-4" />
          All tools
        </Link>

        {/* Header row — compact on mobile (smaller icon, hidden description)
            so the editing canvas gets ~80 px more vertical space on phones.
            Desktop layout (sm+) is unchanged. */}
        <div className="flex flex-row items-center sm:items-center gap-3 sm:gap-4 mb-3 sm:mb-6 md:mb-8">
          <div
            className={`h-10 w-10 sm:h-14 sm:w-14 rounded-xl sm:rounded-2xl bg-gradient-to-br ${tool.accent} flex items-center justify-center shadow-lg shrink-0`}
          >
            <Icon className="h-5 w-5 sm:h-7 sm:w-7 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <h1 className="text-lg sm:text-2xl md:text-3xl font-bold text-gray-900 truncate min-w-0 flex-1">{tool.title}</h1>
              {tool.badge && (
                <Badge
                  className={`text-[10px] font-bold ${
                    tool.badge === "Gov Ready"
                      ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                      : tool.badge === "New"
                        ? "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200"
                        : "bg-amber-100 text-amber-700 border-amber-200"
                  }`}
                >
                  {tool.badge}
                </Badge>
              )}
            </div>
            <p className="hidden sm:block text-sm text-gray-600 mt-1">{tool.description}</p>
          </div>
        </div>

        {fullBleed ? (
          // Full-width editor mode: no right rail, no privacy card.
          // Used by editor tools (PDF / photo) once a file is loaded so the
          // canvas + toolbar use the entire page width — the user explicitly
          // asked to drop the big "100% Private" card while editing.
          <div className="min-w-0 bg-white rounded-xl sm:rounded-2xl border border-gray-200/80 shadow-sm p-3 sm:p-6 md:p-8">
            {children}
          </div>
        ) : (
          <div className="grid lg:grid-cols-[1fr_320px] gap-4 sm:gap-6 lg:gap-8">
            <div className="min-w-0 bg-white rounded-xl sm:rounded-2xl border border-gray-200/80 shadow-sm p-3 sm:p-6 md:p-8">
              {children}
            </div>
            <div className="min-w-0 space-y-4">
              {sidebar}
              <div className="bg-gradient-to-br from-indigo-50 via-white to-violet-50 border border-indigo-100 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-8 w-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                    <ShieldCheck className="h-4 w-4 text-emerald-700" />
                  </div>
                  <div className="font-semibold text-gray-900">100% Private</div>
                </div>
                <p className="text-xs text-gray-600 leading-relaxed">
                  All processing happens locally in your browser. Your files never leave your
                  device — perfect for sensitive government documents.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export { BASE };
