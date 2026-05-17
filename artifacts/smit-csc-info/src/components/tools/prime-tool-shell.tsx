import { Link } from "wouter";
import { ChevronLeft, Crown } from "lucide-react";
import type { ReactNode } from "react";
import type { ToolMeta } from "./tools-data";

interface PrimeToolShellProps {
  tool: ToolMeta;
  children: ReactNode;
}

export function PrimeToolShell({ tool, children }: PrimeToolShellProps) {
  const Icon = tool.icon;
  return (
    <div className="relative min-h-[calc(100vh-4rem)] overflow-hidden bg-gradient-to-br from-[#1a0b2e] via-[#2a1052] to-[#0d0623] text-white">
      <div className="pointer-events-none absolute -top-24 -left-20 h-80 w-80 rounded-full bg-amber-400/20 blur-3xl" />
      <div className="pointer-events-none absolute top-1/3 -right-24 h-96 w-96 rounded-full bg-fuchsia-500/20 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-purple-600/20 blur-3xl" />

      <div className="relative container mx-auto max-w-6xl px-4 py-6 md:py-10">
        <Link
          href="/tools"
          className="inline-flex items-center gap-1 text-sm text-amber-200/80 hover:text-amber-100 mb-4"
        >
          <ChevronLeft className="h-4 w-4" />
          All tools
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-8">
          <div className="relative">
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-amber-300 via-yellow-500 to-purple-600 flex items-center justify-center shadow-[0_8px_30px_-6px_rgba(251,191,36,0.55)]">
              <Icon className="h-8 w-8 text-purple-950" />
            </div>
            <span className="absolute -top-1.5 -right-1.5 rounded-full bg-gradient-to-br from-amber-400 to-yellow-500 p-1 shadow-lg">
              <Crown className="h-3 w-3 text-purple-950" />
            </span>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl md:text-3xl font-extrabold bg-gradient-to-r from-amber-200 via-yellow-100 to-amber-300 bg-clip-text text-transparent drop-shadow">
                {tool.title}
              </h1>
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/40 bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-200">
                <Crown className="h-3 w-3" /> Prime
              </span>
            </div>
            <p className="text-sm text-purple-100/80 mt-1 max-w-2xl">{tool.description}</p>
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-2xl shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)] p-5 sm:p-6 md:p-8">
          {children}
        </div>

        <p className="mt-4 text-center text-[11px] text-purple-200/60">
          🔒 100% private — files are processed in your browser and never uploaded or stored.
        </p>
      </div>
    </div>
  );
}

export function GoldButton({
  children,
  onClick,
  disabled,
  type = "button",
  className = "",
  testId,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
  testId?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className={`relative inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 font-bold text-purple-950 bg-gradient-to-br from-amber-300 via-yellow-400 to-amber-500 shadow-[0_8px_24px_-6px_rgba(251,191,36,0.6)] hover:shadow-[0_10px_30px_-6px_rgba(251,191,36,0.8)] hover:brightness-105 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:brightness-100 ${className}`}
    >
      {children}
    </button>
  );
}

export function GoldLoader({ progress, label }: { progress: number; label?: string }) {
  return (
    <div className="w-full">
      <div className="flex items-center justify-between text-xs text-amber-200/90 mb-1.5">
        <span>{label ?? "Processing…"}</span>
        <span className="font-mono font-bold">{Math.round(progress)}%</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-purple-950/60 ring-1 ring-amber-400/20">
        <div
          className="h-full bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 shadow-[0_0_12px_rgba(251,191,36,0.7)] transition-[width] duration-200"
          style={{ width: `${Math.max(2, Math.min(100, progress))}%` }}
        />
      </div>
    </div>
  );
}
