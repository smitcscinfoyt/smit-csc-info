// IndexedDB-backed blob store for draft autosave of LARGE binary data
// (images, PDFs) that don't fit in localStorage's ~5 MB cap.
//
// Each entry is stored under a string key with a savedAt timestamp so
// stale entries can be GC'd by TTL.
//
// API mirrors lib/draft-store.ts (saveBlob / loadBlob / clearBlob)
// but is async because IndexedDB is async.

const DB_NAME = "smit-drafts";
const DB_VERSION = 1;
const STORE = "blobs";
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

interface BlobEnvelope {
  key: string;
  blob: Blob;
  type: string;
  savedAt: number;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    dbPromise = Promise.resolve(null);
    return dbPromise;
  }
  dbPromise = new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "key" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        console.warn("[blob-store] openDb failed", req.error);
        resolve(null);
      };
      req.onblocked = () => resolve(null);
    } catch (err) {
      console.warn("[blob-store] openDb threw", err);
      resolve(null);
    }
  });
  return dbPromise;
}

export async function saveBlob(key: string, blob: Blob): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      const env: BlobEnvelope = {
        key,
        blob,
        type: blob.type || "application/octet-stream",
        savedAt: Date.now(),
      };
      tx.objectStore(STORE).put(env);
      tx.oncomplete = () => resolve();
      tx.onerror = () => {
        console.warn("[blob-store] saveBlob failed", key, tx.error);
        resolve();
      };
      tx.onabort = () => resolve();
    } catch (err) {
      console.warn("[blob-store] saveBlob threw", key, err);
      resolve();
    }
  });
}

export async function loadBlob(
  key: string,
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<Blob | null> {
  const db = await openDb();
  if (!db) return null;
  return await new Promise<Blob | null>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => {
        const env = req.result as BlobEnvelope | undefined;
        if (!env) return resolve(null);
        if (Date.now() - env.savedAt > ttlMs) {
          // Stale — schedule async cleanup, return null now.
          clearBlob(key);
          return resolve(null);
        }
        resolve(env.blob);
      };
      req.onerror = () => {
        console.warn("[blob-store] loadBlob failed", key, req.error);
        resolve(null);
      };
    } catch (err) {
      console.warn("[blob-store] loadBlob threw", key, err);
      resolve(null);
    }
  });
}

export async function clearBlob(key: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function clearAllBlobs(): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}
