// PrimeStudioGate — route-level wrapper around <PrimeStudioPage>.
//
// User preference: NO edits inside `components/prime-studio/`. Prime
// Studio's exports (PNG / JPG / PDF, jsPDF.save, multi-page bundles)
// are triggered from `[role="menuitem"]` entries in the Export and
// File dropdowns. Internally those hand off to jsPDF + file-saver,
// which create detached <a download> elements and dispatch synthetic
// MouseEvents — meaning a plain anchor-prototype patch can't always
// catch them, and even when it does the underlying export pipeline
// can throw mid-flight (yielding the "Export failed: undefined"
// alert the user reported).
//
// So we intercept ONE step earlier: a capture-phase click listener on
// document inspects the menu item that was clicked. If its label
// matches an export action ("PDF (multi-page…)", "PNG (high…)",
// "JPG (300 DPI)", "Save (download .json)" etc.) we cancel the
// click before React's onClick (and therefore jsPDF) ever runs, and
// open the Prime upgrade modal instead.
//
// We also keep the anchor-prototype patch as a belt-and-braces
// safety net for any future export path that bypasses the menu.
//
// Both patches are skipped while the user is Prime / staff (or while
// status is still resolving — better than blocking a real member's
// first export click) and are restored on unmount.

import { useEffect } from "react";
import PrimeStudioPage from "@/pages/tools/prime-studio";
import { usePrimeStatus } from "@/hooks/use-prime";
import { useAuth } from "@/hooks/use-auth";
import { usePrimeDownloadGate } from "@/hooks/use-prime-download-gate";

const TOOL_ID = "prime-studio";
const TOOL_TITLE = "Prime Studio";

// Anything in the Prime Studio File / Export dropdowns whose visible
// text starts with one of these prefixes is treated as a download
// action that requires Prime. The patterns are intentionally tight
// so non-export menu items (Undo / Redo / template names / brand kit
// entries / etc.) keep working for everyone.
const EXPORT_LABEL_RE =
  /^\s*(pdf\b|png\b|jpg\b|jpeg\b|save\s*\(download|download\b)/i;

// Selectors whose pointerdown / click should be blocked entirely for
// non-Prime users — pre-empts the dropdown from ever opening so there
// is no race window where Radix's own onSelect / pointerup handler
// might fire `doExport` before our menu-item interceptor runs.
const TRIGGER_SELECTORS = ['[data-testid="btn-export"]'];

export default function PrimeStudioGate() {
  const { user } = useAuth();
  const { isPrime, resolved } = usePrimeStatus();
  const isAllowed = !!user && resolved && isPrime;

  const { requirePrime, modal } = usePrimeDownloadGate({
    toolId: TOOL_ID,
    toolTitle: TOOL_TITLE,
    actionLabel: "Export",
  });

  useEffect(() => {
    // Prime member or staff — no gating needed.
    // We DO install listeners while Prime status is still resolving:
    // `requirePrime` itself queues the click in that window and either
    // fires it (if user turns out to be Prime) or opens the paywall
    // (non-Prime). This closes a timing-based bypass where a non-Prime
    // user could click Export before /api/user/status returned.
    if (isAllowed) return;

    // ── 1. Capture-phase menu-item interceptor ──────────────────
    const onMenuClickCapture = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      // Radix DropdownMenu renders entries with role="menuitem".
      const item = target.closest?.('[role="menuitem"]') as HTMLElement | null;
      if (!item) return;
      const label = (item.textContent ?? "").trim();
      if (!EXPORT_LABEL_RE.test(label)) return;

      // Cancel the click so React's onClick (which would fire
      // doExport → jsPDF → potentially throw) never runs.
      e.preventDefault();
      e.stopImmediatePropagation();

      try {
        requirePrime(() => {
          // After upgrade Prime Studio owns its own export state,
          // so the user simply re-clicks Export and it succeeds.
          // No replay action needed here.
        });
      } catch {
        /* never let the gate's open-modal call surface as an
           uncaught error to the page */
      }
    };
    document.addEventListener("click", onMenuClickCapture, true);

    // ── 1b. Trigger-button pre-emption (pointerdown + click) ────
    // Block the Export trigger button (and similar) BEFORE Radix
    // opens the dropdown. This closes a race where Radix's own
    // pointerup / onSelect can fire `doExport` before our
    // menu-item click interceptor gets a chance to cancel.
    const onTriggerCapture = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      for (const sel of TRIGGER_SELECTORS) {
        const hit = target.closest?.(sel);
        if (!hit) continue;
        e.preventDefault();
        e.stopImmediatePropagation();
        try {
          requirePrime(() => {
            /* No replay — user re-clicks Export after upgrade. */
          });
        } catch {
          /* swallow */
        }
        return;
      }
    };
    document.addEventListener("pointerdown", onTriggerCapture, true);
    document.addEventListener("click", onTriggerCapture, true);

    // ── 2. Anchor-prototype + capture-anchor safety nets ────────
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function patchedAnchorClick() {
      try {
        if (this.hasAttribute("download") && this.getAttribute("href")) {
          requirePrime(() => { origClick.call(this); });
          return;
        }
      } catch {
        /* fall through to original click on any unexpected error */
      }
      origClick.call(this);
    };

    const onAnchorCaptureClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const a = target.closest?.("a[download]") as HTMLAnchorElement | null;
      if (!a) return;
      e.preventDefault();
      e.stopPropagation();
      try {
        requirePrime(() => { origClick.call(a); });
      } catch {
        /* swallow — modal-open should never break the page */
      }
    };
    document.addEventListener("click", onAnchorCaptureClick, true);

    return () => {
      document.removeEventListener("click", onMenuClickCapture, true);
      document.removeEventListener("pointerdown", onTriggerCapture, true);
      document.removeEventListener("click", onTriggerCapture, true);
      document.removeEventListener("click", onAnchorCaptureClick, true);
      HTMLAnchorElement.prototype.click = origClick;
    };
  }, [isAllowed, resolved, requirePrime]);

  // Premium look — Prime member only. Tag <body> so the CSS in
  // index.css (`body.prime-studio-premium …`) can style top-bar
  // triggers and Radix-portaled dropdown items without touching
  // the off-limits prime-studio/ folder.
  useEffect(() => {
    if (!isAllowed) return;
    document.body.classList.add("prime-studio-premium");
    return () => {
      document.body.classList.remove("prime-studio-premium");
    };
  }, [isAllowed]);

  return (
    <div className={isAllowed ? "prime-studio-premium-host" : undefined}>
      <PrimeStudioPage />
      {modal}
    </div>
  );
}
