// usePrimeDownloadGate — central wrapper used by every Prime tool's
// download/export button. Free + non-Prime + anonymous users hit the
// PrimeUpgradeModal; Prime members and staff fall straight through.
//
// Each tool passes a stable `toolId` (e.g. "id-card-engine"). When a
// non-Prime user triggers the gate we:
//   1. Persist a "pending download" intent under that toolId so the
//      tool can auto-resume after the user upgrades and lands back on
//      the same page (see use-auto-resume-download).
//   2. Open the modal.
//
// Race-condition handling:
// If the user is logged in but their Prime status hasn't resolved yet
// (a brief window during initial load), we queue the requested action
// in a ref instead of immediately gating. Once `resolved` flips true,
// an effect either fires the queued action (Prime) or opens the modal
// (non-Prime). This prevents Prime members from hitting a paywall
// just because they clicked "Download" before /api/user/status came
// back.
//
// Returns the modal element to mount in the tool's tree, so callers
// don't have to manage the open/close state themselves.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { usePrimeStatus } from "@/hooks/use-prime";
import { useAuth } from "@/hooks/use-auth";
import { savePendingDownload } from "@/lib/prime-tool-state";
import { PrimeUpgradeModal } from "@/components/prime-gate/PrimeUpgradeModal";

interface Options {
  /** Stable identifier (typically the route slug) used for pending intent + draft keys. */
  toolId: string;
  /** Pretty title shown inside the modal header. */
  toolTitle?: string;
  /** Verb shown in the modal CTA ("Download" / "Export" / "Save"). */
  actionLabel?: string;
}

interface GateApi {
  isPrime: boolean;
  primeResolved: boolean;
  /** Wrap a download/export click. Falls through synchronously when Prime; otherwise opens the paywall. */
  requirePrime: (run: () => void | Promise<void>, snapshotKey?: string) => void;
  /** Mount this in the tool tree. */
  modal: ReactNode;
  /** Imperative open — useful for "Save your work" pre-emptive prompts. */
  openModal: () => void;
}

interface PendingClick {
  run: () => void | Promise<void>;
  snapshotKey?: string;
}

export function usePrimeDownloadGate(opts: Options): GateApi {
  const { toolId, toolTitle, actionLabel = "Download" } = opts;
  const { user } = useAuth();
  const { isPrime, resolved } = usePrimeStatus();
  const [open, setOpen] = useState(false);
  const pendingClickRef = useRef<PendingClick | null>(null);

  const stashAndOpen = useCallback(
    (snapshotKey: string | undefined) => {
      try {
        savePendingDownload({
          toolId,
          returnTo: window.location.pathname + window.location.search,
          snapshotKey,
        });
      } catch {
        /* storage unavailable — modal still opens, just no auto-resume */
      }
      setOpen(true);
    },
    [toolId],
  );

  const requirePrime = useCallback(
    (run: () => void | Promise<void>, snapshotKey?: string) => {
      // Anonymous → straight to modal.
      if (!user) {
        stashAndOpen(snapshotKey);
        return;
      }
      // Logged in but status still resolving → queue and decide later.
      if (!resolved) {
        pendingClickRef.current = { run, snapshotKey };
        return;
      }
      if (isPrime) {
        void run();
        return;
      }
      stashAndOpen(snapshotKey);
    },
    [user, resolved, isPrime, stashAndOpen],
  );

  // Drain a queued click once Prime status resolves.
  useEffect(() => {
    if (!user || !resolved) return;
    const pending = pendingClickRef.current;
    if (!pending) return;
    pendingClickRef.current = null;
    if (isPrime) {
      void pending.run();
    } else {
      stashAndOpen(pending.snapshotKey);
    }
  }, [user, resolved, isPrime, stashAndOpen]);

  return {
    isPrime: !!user && resolved && isPrime,
    primeResolved: resolved,
    requirePrime,
    openModal: () => setOpen(true),
    modal: (
      <PrimeUpgradeModal
        open={open}
        onOpenChange={setOpen}
        toolTitle={toolTitle}
        actionLabel={actionLabel}
      />
    ),
  };
}
