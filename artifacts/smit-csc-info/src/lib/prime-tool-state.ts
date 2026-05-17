// Per-tool persistence helpers used by the Prime download gate.
//
// Two responsibilities:
//   1. `prime-pending` slot — when a non-Prime user clicks Download/Export,
//      we stash a small descriptor (toolId, tool route, optional snapshot
//      key) here. After they upgrade and return, the tool checks this
//      slot on mount and auto-fires the original download.
//   2. `prime-draft` slot — generic per-tool autosave key built on top of
//      lib/draft-store.ts so the user's in-progress work survives a
//      PhonePe redirect.
//
// localStorage namespace and TTL come from draft-store.ts (24 h).

import { saveDraft, loadDraft, clearDraft } from "@/lib/draft-store";

const PENDING_PREFIX = "prime-pending:";
const TOOL_DRAFT_PREFIX = "prime-tool:";

export interface PendingDownload {
  toolId: string;
  /** Route to send the user back to after upgrade (e.g. /tools/image-upscaler). */
  returnTo: string;
  /** Free-form snapshot reference — the tool itself owns the schema. */
  snapshotKey?: string;
  /** Unix ms — used to ignore very old intents on tool mount. */
  createdAt: number;
}

export function savePendingDownload(p: Omit<PendingDownload, "createdAt">): void {
  saveDraft<PendingDownload>(PENDING_PREFIX + p.toolId, {
    ...p,
    createdAt: Date.now(),
  });
}

export function getPendingDownload(toolId: string): PendingDownload | null {
  return loadDraft<PendingDownload>(PENDING_PREFIX + toolId);
}

export function clearPendingDownload(toolId: string): void {
  clearDraft(PENDING_PREFIX + toolId);
}

export function saveToolDraft<T>(toolId: string, data: T, version = 1): void {
  saveDraft<T>(TOOL_DRAFT_PREFIX + toolId, data, version);
}

export function loadToolDraft<T>(toolId: string, version = 1): T | null {
  return loadDraft<T>(TOOL_DRAFT_PREFIX + toolId, version);
}

export function clearToolDraft(toolId: string): void {
  clearDraft(TOOL_DRAFT_PREFIX + toolId);
}
