// Async companion to use-draft-autosave for binary File / Blob payloads
// (images, PDFs) backed by IndexedDB.
//
// USAGE:
//   const [file, setFile] = useState<File | null>(null);
//   const { restoring } = useDraftBlob("bg-remover:source", file, (b, meta) => {
//     // Restore: rebuild a File so the rest of the page sees the same shape.
//     setFile(new File([b], meta.name, { type: meta.type }));
//   });
//   // Manually clear after successful submit:
//   await clearBlob("bg-remover:source");

import { useEffect, useRef, useState } from "react";
import { saveBlob, loadBlob, clearBlob } from "@/lib/blob-store";
import { saveDraft, loadDraft, clearDraft } from "@/lib/draft-store";

interface BlobMeta {
  name: string;
  type: string;
  size: number;
}

interface Result {
  /** True while we're loading any persisted blob from IndexedDB on mount. */
  restoring: boolean;
}

/**
 * Persist a File/Blob to IndexedDB whenever it changes, and restore it
 * once on mount via `onRestore`. Pass `null` to clear.
 *
 * Metadata (filename, mime type, size) is mirrored to localStorage so
 * we can rebuild a `File` object — IndexedDB only stores the raw Blob.
 */
export function useDraftBlob(
  key: string,
  file: File | Blob | null,
  onRestore: (blob: Blob, meta: BlobMeta) => void,
  opts: { enabled?: boolean } = {},
): Result {
  const { enabled = true } = opts;
  const [restoring, setRestoring] = useState(true);
  const restoredRef = useRef(false);
  const lastSavedRef = useRef<Blob | File | null>(null);

  // Restore on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!enabled) {
        setRestoring(false);
        return;
      }
      try {
        const meta = loadDraft<BlobMeta>(`blob-meta:${key}`);
        const blob = await loadBlob(key);
        if (cancelled) return;
        if (blob && meta) {
          restoredRef.current = true;
          lastSavedRef.current = blob;
          onRestore(blob, meta);
        }
      } finally {
        if (!cancelled) setRestoring(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  // Persist on change.
  useEffect(() => {
    if (!enabled) return;
    if (restoring) return;
    // Skip the initial render when `file` is the very blob we just restored —
    // saving it back is wasteful but harmless.
    if (file === lastSavedRef.current) return;

    if (!file) {
      lastSavedRef.current = null;
      void clearBlob(key);
      clearDraft(`blob-meta:${key}`);
      return;
    }

    lastSavedRef.current = file;
    const name = (file as File).name ?? "draft";
    const meta: BlobMeta = { name, type: file.type, size: file.size };
    saveDraft(`blob-meta:${key}`, meta);
    void saveBlob(key, file);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, key, enabled, restoring]);

  return { restoring };
}
