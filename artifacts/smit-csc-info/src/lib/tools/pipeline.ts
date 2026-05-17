// In-memory + sessionStorage hand-off between tools so that a user can flow
// the just-processed file into the next tool without downloading and
// re-uploading. The dual-layer approach makes the chain robust against:
//   - the page transition animation (AnimatePresence mode="wait" delays the
//     destination's mount until the source's exit animation completes),
//   - Vite HMR module re-evaluation in dev,
//   - and accidental remounts.
// On a hard refresh the sessionStorage entry is wiped (we clear it on app
// boot) for privacy, matching the original "ephemeral" intent.

type PendingKind = "pdf" | "image" | "any";

interface PendingFile {
  file: File;
  kind: PendingKind;
  fromSlug?: string;
}

interface PersistedMeta {
  blobUrl: string;
  filename: string;
  mime: string;
  kind: PendingKind;
  fromSlug?: string;
}

const STORAGE_KEY = "smit-csc-pipeline-pending";
const EVENT = "smit-csc-pipeline:changed";

let pending: PendingFile | null = null;

function emit() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(EVENT));
  }
}

function persist(file: File, kind: PendingKind, fromSlug?: string) {
  if (typeof window === "undefined") return;
  try {
    // Revoke any prior URL to avoid leaking blob URLs across consecutive chains.
    const prev = sessionStorage.getItem(STORAGE_KEY);
    if (prev) {
      try {
        const { blobUrl } = JSON.parse(prev) as PersistedMeta;
        URL.revokeObjectURL(blobUrl);
      } catch {
        /* ignore */
      }
    }
    const blobUrl = URL.createObjectURL(file);
    const meta: PersistedMeta = {
      blobUrl,
      filename: file.name,
      mime: file.type,
      kind,
      fromSlug,
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(meta));
  } catch {
    /* sessionStorage may be disabled — fall back to in-memory only */
  }
}

async function rehydrateFromStorage(): Promise<PendingFile | null> {
  if (typeof window === "undefined") return null;
  let raw: string | null;
  try {
    raw = sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const meta = JSON.parse(raw) as PersistedMeta;
    const res = await fetch(meta.blobUrl);
    if (!res.ok) return null;
    const blob = await res.blob();
    const file = new File([blob], meta.filename, {
      type: meta.mime || blob.type || "application/octet-stream",
    });
    return { file, kind: meta.kind, fromSlug: meta.fromSlug };
  } catch {
    return null;
  }
}

let scheduledClear: ReturnType<typeof setTimeout> | null = null;

function cancelScheduledClear() {
  if (scheduledClear) {
    clearTimeout(scheduledClear);
    scheduledClear = null;
  }
}

export function setPendingFile(file: File, kind: PendingKind, fromSlug?: string) {
  cancelScheduledClear();
  pending = { file, kind, fromSlug };
  persist(file, kind, fromSlug);
  emit();
}

export function peekPendingFile(): PendingFile | null {
  return pending;
}

/**
 * Take the pending file out of the pipeline if it matches the desired `accept`
 * mime expression (e.g. "application/pdf" or "image/*"). Returns the File and
 * clears the pipeline; returns null when nothing is queued or the type
 * doesn't match. Async because we may need to rehydrate from sessionStorage.
 */
export async function consumePendingFile(accept: string): Promise<File | null> {
  if (!pending) {
    pending = await rehydrateFromStorage();
    if (!pending) return null;
  }
  const f = pending.file;
  const acceptList = accept.split(",").map((s) => s.trim()).filter(Boolean);
  const matches = acceptList.some((a) => {
    if (a === "*/*" || a === "*") return true;
    if (a.endsWith("/*")) {
      const prefix = a.slice(0, -1);
      if (f.type.startsWith(prefix)) return true;
      if (prefix === "image/" && pending!.kind === "image") return true;
      if (prefix === "application/" && pending!.kind === "pdf") return true;
      return false;
    }
    if (a.startsWith(".")) return f.name.toLowerCase().endsWith(a.toLowerCase());
    if (f.type === a) return true;
    if (a === "application/pdf" && pending!.kind === "pdf") return true;
    if (a.startsWith("image/") && pending!.kind === "image") return true;
    return false;
  });
  if (!matches) return null;
  // Don't clear immediately. The destination component may remount once during
  // page transition (e.g., due to AnimatePresence reconciling), and a hard
  // clear would lose the file on the second mount. Schedule a debounced clear
  // — if no remount happens, the pending is wiped after the grace window.
  cancelScheduledClear();
  scheduledClear = setTimeout(() => {
    scheduledClear = null;
    clearPendingFile();
  }, 4000);
  return f;
}

export function clearPendingFile() {
  pending = null;
  if (typeof window === "undefined") return;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const { blobUrl } = JSON.parse(raw) as PersistedMeta;
        URL.revokeObjectURL(blobUrl);
      } catch {
        /* ignore */
      }
    }
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  emit();
}

/**
 * Subscribe to pipeline changes. Returns an unsubscribe function. Useful for
 * components (like DropZone) that may mount BEFORE a file is queued — e.g.
 * when AnimatePresence delays the destination's mount until after the source's
 * exit animation completes, the pending could in some quirky cases land
 * shortly after mount.
 */
export function subscribeToPipeline(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}

/**
 * Best-effort cleanup at app boot — wipes any leftover blob URLs from a
 * previous tab/session so privacy expectations are preserved.
 */
export function resetPipelineOnBoot() {
  if (typeof window === "undefined") return;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const { blobUrl } = JSON.parse(raw) as PersistedMeta;
        URL.revokeObjectURL(blobUrl);
      } catch {
        /* ignore */
      }
      sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
}
