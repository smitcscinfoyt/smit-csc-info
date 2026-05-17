// Draft autosave store — persists small JSON-serializable state to
// localStorage with namespace + TTL so that a browser refresh
// (especially Android Chrome killing the tab to free RAM during a
// file picker / camera intent) does not lose user progress.
//
// For LARGE binary data (image / PDF blobs) use lib/blob-store.ts
// (IndexedDB-backed) — localStorage has a ~5 MB cap and stringifies
// every value, which is unsuitable for blobs.

const NS = "smit:draft:";
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface DraftEnvelope<T> {
  v: number; // schema version (caller-defined)
  t: number; // savedAt unix ms
  d: T; // payload
}

function isStorageAvailable(): boolean {
  try {
    if (typeof window === "undefined" || !window.localStorage) return false;
    const probe = "__smit_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    // Safari private mode, quota exceeded, etc.
    return false;
  }
}

const storageOk = isStorageAvailable();

export function saveDraft<T>(key: string, data: T, version = 1): void {
  if (!storageOk) return;
  try {
    const env: DraftEnvelope<T> = { v: version, t: Date.now(), d: data };
    window.localStorage.setItem(NS + key, JSON.stringify(env));
  } catch (err) {
    // Quota exceeded — silently drop the save. The user will lose
    // this draft if they refresh, but the app keeps working.
    console.warn("[draft-store] saveDraft failed for", key, err);
  }
}

export function loadDraft<T>(
  key: string,
  expectedVersion = 1,
  ttlMs: number = DEFAULT_TTL_MS,
): T | null {
  if (!storageOk) return null;
  try {
    const raw = window.localStorage.getItem(NS + key);
    if (!raw) return null;
    const env = JSON.parse(raw) as DraftEnvelope<T>;
    if (!env || typeof env !== "object") return null;
    if (env.v !== expectedVersion) {
      // Schema mismatch — drop stale draft.
      window.localStorage.removeItem(NS + key);
      return null;
    }
    if (Date.now() - env.t > ttlMs) {
      window.localStorage.removeItem(NS + key);
      return null;
    }
    return env.d;
  } catch (err) {
    console.warn("[draft-store] loadDraft failed for", key, err);
    return null;
  }
}

export function clearDraft(key: string): void {
  if (!storageOk) return;
  try {
    window.localStorage.removeItem(NS + key);
  } catch {
    /* no-op */
  }
}

export function clearAllDrafts(): void {
  if (!storageOk) return;
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(NS)) toRemove.push(k);
    }
    for (const k of toRemove) window.localStorage.removeItem(k);
  } catch {
    /* no-op */
  }
}
