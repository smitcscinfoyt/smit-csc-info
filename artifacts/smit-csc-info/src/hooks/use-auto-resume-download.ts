// useAutoResumeDownload — fires the tool's download/export action
// automatically once the user becomes Prime and lands back on the
// tool page after a successful PhonePe upgrade.
//
// Flow:
//   1. Non-Prime user clicks Download → use-prime-download-gate
//      stashes a `prime-pending:<toolId>` intent and shows modal.
//   2. User pays via PhonePe → /payment/success verifies the txn,
//      invalidates the `user-status` query, then they navigate (or
//      we navigate them) back to the tool route stored in `returnTo`.
//   3. This hook detects (a) a stored intent for this tool AND
//      (b) a now-Prime user AND (c) the `ready` predicate from the
//      caller (e.g. "the file is loaded and the export is possible").
//      It then calls `run()` once and clears the intent.

import { useEffect, useRef } from "react";
import { usePrimeStatus } from "@/hooks/use-prime";
import { useAuth } from "@/hooks/use-auth";
import { getPendingDownload, clearPendingDownload } from "@/lib/prime-tool-state";

interface Options {
  toolId: string;
  /**
   * Caller-supplied predicate. The auto-fire only triggers when this
   * returns true — e.g. the tool has finished hydrating from autosave
   * and the export action is actually ready to run.
   * Re-evaluated whenever any of the caller's dependencies change.
   */
  ready: boolean;
  /** The action to invoke once. Same callback used by the in-tool button. */
  run: () => void | Promise<void>;
}

export function useAutoResumeDownload({ toolId, ready, run }: Options): void {
  const { user } = useAuth();
  const { isPrime, resolved } = usePrimeStatus();
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    if (!user || !resolved || !isPrime || !ready) return;
    const pending = getPendingDownload(toolId);
    if (!pending) return;
    // Found a stale-but-valid intent for this tool — fire once, then
    // clear so a future tool-page visit doesn't repeatedly download.
    firedRef.current = true;
    clearPendingDownload(toolId);
    // Tiny delay so the gate-modal close animation (if still open) and
    // any post-mount layout settle first.
    const handle = setTimeout(() => { void run(); }, 250);
    return () => clearTimeout(handle);
  }, [toolId, user, resolved, isPrime, ready, run]);
}
