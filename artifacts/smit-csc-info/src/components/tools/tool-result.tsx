import { useLocation } from "wouter";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Download, ChevronRight, RotateCcw, FileText, Crown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadBlob, formatBytes } from "@/lib/tools/file";
import { setPendingFile } from "@/lib/tools/pipeline";
import { TOOLS, type ToolMeta } from "@/components/tools/tools-data";
import { usePrimeStatus } from "@/hooks/use-prime";
import { useAuth } from "@/hooks/use-auth";
import { PrimeUpgradeModal } from "@/components/prime-gate/PrimeUpgradeModal";

type Kind = "pdf" | "image";

interface ToolResultProps {
  /** The processed file ready for download / further chaining. */
  blob: Blob;
  /** Final filename to suggest on download. */
  filename: string;
  /** What kind of file this is — drives the suggested-next list. */
  kind: Kind;
  /** Slug of the tool that produced this result (so it's hidden from the next-up list). */
  fromSlug: string;
  /** Called when the user clicks "Start over" — should reset the parent tool state. */
  onStartOver?: () => void;
  /** Custom subtitle line under "Your document is ready". */
  subtitle?: string;
  /**
   * Optional gate. When provided, the Download button click is funneled
   * through this wrapper instead of running directly. Prime tools pass
   * the `requirePrime` returned by `usePrimeDownloadGate` so that the
   * paywall modal opens for non-Prime users while keeping the result
   * preview visible.
   */
  requirePrime?: (run: () => void | Promise<void>, snapshotKey?: string) => void;
  /** Snapshot key forwarded to `requirePrime` (so we can restore state on auto-resume). */
  snapshotKey?: string;
}

// Curated, ordered chains for each output type — matches Sejda's pattern of
// surfacing the most useful next step first.
const PDF_CHAIN = [
  "pdf-compressor",
  "pdf-editor-v2",
  "esign-pdf",
  "watermark-pdf",
  "delete-pages",
  "split-pdf",
  "merge-pdf",
  "rotate-pdf",
  "pdf-to-jpg",
  "pdf-to-text",
  "pdf-to-word",
  "lock-pdf",
  "unlock-pdf",
];

const IMAGE_CHAIN = [
  "image-compressor",
  "dpi-converter",
  "background-remover",
  "image-upscaler",
  "pan-photo-resizer",
  "signature-resizer",
  "passport-photo-maker",
  "jpg-to-pdf",
];

function buildList(kind: Kind, fromSlug: string): ToolMeta[] {
  const order = kind === "pdf" ? PDF_CHAIN : IMAGE_CHAIN;
  const bySlug = new Map(TOOLS.map((t) => [t.slug, t]));
  return order
    .filter((s) => s !== fromSlug)
    .map((s) => bySlug.get(s))
    .filter((t): t is ToolMeta => !!t);
}

export function ToolResult({
  blob,
  filename,
  kind,
  fromSlug,
  onStartOver,
  subtitle,
  requirePrime,
  snapshotKey,
}: ToolResultProps) {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { isPrime, resolved: primeResolved } = usePrimeStatus();
  const next = buildList(kind, fromSlug);
  // If the SOURCE tool (the one that produced this result) is itself
  // Prime-only, then a non-Prime user has obviously slipped in — Prime
  // tool routes aren't ProtectedRoute-gated, only download is. In that
  // case we must lock the entire Continue list, not just Prime entries:
  // otherwise the user could chain into a free tool (e.g. Split PDF)
  // and download the file from there, defeating the paywall on the
  // current tool. The flag below makes EVERY click open the gate.
  const sourceTool = TOOLS.find((x) => x.slug === fromSlug);
  const sourceIsPrime = !!sourceTool?.prime;
  // When a non-Prime user (logged-in or anonymous) taps a Prime-only
  // tool in the "Continue with this file" list, we open the upgrade
  // paywall right here instead of letting them navigate into the tool.
  // This blocks the only entry path through which a non-Prime user
  // could reach a Prime tool without paying. The destination tool
  // routes themselves are NOT ProtectedRoute-gated (they only gate
  // download/export), so this list is the single point of enforcement
  // for chained access.
  const [primeModalOpen, setPrimeModalOpen] = useState(false);
  const [primeModalTool, setPrimeModalTool] = useState<ToolMeta | null>(null);
  // Race guard: if a logged-in user clicks a Prime tool before
  // /api/user/status resolves, queue the click and decide once
  // `primeResolved` flips true. Same shape as use-prime-download-gate.
  const pendingPrimeClickRef = useRef<ToolMeta | null>(null);
  const [pendingPrimeSlug, setPendingPrimeSlug] = useState<string | null>(null);

  const proceedToTool = (t: ToolMeta) => {
    const file = new File([blob], filename, { type: blob.type || "application/octet-stream" });
    setPendingFile(file, kind, fromSlug);
    navigate(`/tools/${t.slug}`);
    // Scroll to top so the next tool's drop-zone (with the file already loaded) is visible.
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  };

  const openPrimeGate = (t: ToolMeta) => {
    setPrimeModalTool(t);
    setPrimeModalOpen(true);
  };

  const continueTo = (t: ToolMeta) => {
    // The destination requires gating either because it's a Prime tool
    // OR because the SOURCE tool is Prime (in which case ANY chain —
    // even into a free tool — would let a non-Prime user download the
    // paywalled file from the next tool's UI).
    const needsGate = t.prime || sourceIsPrime;

    if (!needsGate) {
      proceedToTool(t);
      return;
    }
    // Anonymous → status resolves immediately as not-Prime, but be
    // explicit so the gate fires without waiting on an effect.
    if (!user) {
      openPrimeGate(t);
      return;
    }
    // Logged in but Prime status still resolving → queue click so the
    // user neither slips through nor sees a wrong paywall flash if
    // they're actually Prime. The effect below drains it on resolve.
    if (!primeResolved) {
      pendingPrimeClickRef.current = t;
      setPendingPrimeSlug(t.slug);
      return;
    }
    if (isPrime) {
      proceedToTool(t);
    } else {
      openPrimeGate(t);
    }
  };

  // Drain a queued Prime-tool click once status resolves.
  useEffect(() => {
    if (!user || !primeResolved) return;
    const queued = pendingPrimeClickRef.current;
    if (!queued) return;
    pendingPrimeClickRef.current = null;
    setPendingPrimeSlug(null);
    if (isPrime) {
      proceedToTool(queued);
    } else {
      openPrimeGate(queued);
    }
    // proceedToTool/openPrimeGate are stable-enough closures; we only
    // want this to fire on resolve transitions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, primeResolved, isPrime]);

  return (
    <div className="mt-6 rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-emerald-50/40 overflow-hidden shadow-sm">
      <div className="flex items-center gap-2 px-5 pt-5">
        <CheckCircle2 className="h-6 w-6 text-emerald-600" />
        <h3 className="text-lg sm:text-xl font-black text-gray-900">Your document is ready</h3>
      </div>
      {subtitle && <div className="px-5 mt-1 text-xs text-gray-500">{subtitle}</div>}

      <div className="grid lg:grid-cols-[minmax(0,1fr),340px] gap-0 mt-4">
        {/* Left: file + download */}
        <div className="px-5 pb-5 min-w-0">
          <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-200 min-w-0">
            <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
              <FileText className="h-5 w-5 text-emerald-700" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-gray-900 break-all" title={filename}>
                {filename}
              </div>
              <div className="text-xs text-gray-500">{formatBytes(blob.size)}</div>
            </div>
          </div>

          <Button
            onClick={() => {
              const doDownload = () => downloadBlob(blob, filename);
              if (requirePrime) requirePrime(doDownload, snapshotKey);
              else doDownload();
            }}
            size="lg"
            className="mt-4 w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md shadow-emerald-200"
            data-testid="btn-tool-result-download"
          >
            {requirePrime && !isPrime ? (
              <><Crown className="h-5 w-5 mr-2" /> Download (Prime)</>
            ) : (
              <><Download className="h-5 w-5 mr-2" /> Download</>
            )}
          </Button>

          {onStartOver && (
            <Button
              onClick={onStartOver}
              variant="outline"
              className="mt-2 w-full border-gray-200 text-gray-700"
            >
              <RotateCcw className="h-4 w-4 mr-2" /> Start over
            </Button>
          )}
        </div>

        {/* Right: continue with another tool */}
        <div className="lg:border-l border-emerald-100 bg-white/60 px-3 py-4 min-w-0">
          <div className="text-[10px] font-bold tracking-widest text-gray-500 uppercase px-2 mb-2">
            Continue with this file
          </div>
          <div className="max-h-[420px] overflow-y-auto pr-1">
            {next.map((t) => {
              const Icon = t.icon;
              // Show the Prime badge whenever this row would gate for
              // the current viewer — either because the destination is
              // Prime, or because the source is Prime and chaining is
              // locked across the board.
              const locked = (!!t.prime || sourceIsPrime) && !isPrime;
              const isPending = pendingPrimeSlug === t.slug;
              return (
                <button
                  key={t.slug}
                  type="button"
                  onClick={() => continueTo(t)}
                  disabled={isPending}
                  className="w-full text-left flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-indigo-50 transition group min-w-0 disabled:opacity-70 disabled:cursor-wait"
                  title={locked ? "Prime members only" : undefined}
                  data-testid={`btn-continue-${t.slug}`}
                >
                  <div
                    className={`h-7 w-7 rounded-md bg-gradient-to-br ${t.accent} flex items-center justify-center shrink-0`}
                  >
                    <Icon className="h-3.5 w-3.5 text-white" />
                  </div>
                  <span className="flex-1 min-w-0 text-sm font-medium text-gray-800 break-words leading-tight">
                    {t.title}
                  </span>
                  {locked && (
                    <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 shrink-0">
                      <Crown className="h-2.5 w-2.5" />
                      Prime
                    </span>
                  )}
                  {isPending ? (
                    <Loader2 className="h-4 w-4 text-indigo-500 animate-spin shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-transform shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Prime paywall — opens when a non-Prime user picks a Prime tool
          from the "Continue with this file" list. We do NOT queue the
          pending file here, so even if the user closes the modal they
          can't sneak into the locked tool. */}
      <PrimeUpgradeModal
        open={primeModalOpen}
        onOpenChange={(v) => {
          setPrimeModalOpen(v);
          if (!v) setPrimeModalTool(null);
        }}
        toolTitle={primeModalTool?.title}
        actionLabel="Use"
      />
    </div>
  );
}
