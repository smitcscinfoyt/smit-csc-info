// React hook that auto-persists a JSON-serializable state object to
// localStorage (via lib/draft-store) on every change, debounced so it
// doesn't thrash storage during rapid keystrokes.
//
// USAGE (text-only forms):
//   const [name, setName] = useState("");
//   const [mobile, setMobile] = useState("");
//   useDraftAutosave("checkout:operator-gold", { name, mobile });
//   // and on mount:
//   useEffect(() => {
//     const d = loadDraft<{ name: string; mobile: string }>("checkout:operator-gold");
//     if (d) { setName(d.name); setMobile(d.mobile); }
//   }, []);
//
// For binary data (images/PDFs) use lib/blob-store directly — it's
// async and keyed similarly.

import { useEffect, useRef } from "react";
import { saveDraft } from "@/lib/draft-store";

interface Options {
  /** Debounce window in ms. Default 500. */
  debounceMs?: number;
  /** Schema version. Bump to invalidate older drafts after shape change. */
  version?: number;
  /** When false, autosave is paused (e.g. while submitting). */
  enabled?: boolean;
}

export function useDraftAutosave<T>(
  key: string,
  data: T,
  opts: Options = {},
): void {
  const { debounceMs = 500, version = 1, enabled = true } = opts;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      saveDraft(key, data, version);
    }, debounceMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // We intentionally stringify `data` for the dep so that nested
    // object/array changes are detected without forcing the caller to
    // memoise. For very large state this could be slow — those callers
    // should pass a memoised reference instead. Forms (the primary use
    // case) typically have <50 fields and stringify in microseconds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, JSON.stringify(data), version, enabled, debounceMs]);
}
