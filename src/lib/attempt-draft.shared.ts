const DRAFT_PREFIX = "alyson:attempt-draft:";

export function attemptDraftStorageKey(assignmentId: string): string {
  return `${DRAFT_PREFIX}${assignmentId}`;
}

export function loadLocalAttemptDraft(assignmentId: string): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(attemptDraftStorageKey(assignmentId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveLocalAttemptDraft(
  assignmentId: string,
  answers: Record<string, string>,
): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(attemptDraftStorageKey(assignmentId), JSON.stringify(answers));
  } catch {
    /* quota / private mode */
  }
}

export function clearLocalAttemptDraft(assignmentId: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(attemptDraftStorageKey(assignmentId));
  } catch {
    /* ignore */
  }
}

/** Prefer the longest non-empty value per question when merging drafts. */
export function mergeDraftAnswers(
  ...sources: Record<string, string>[]
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const src of sources) {
    for (const [k, v] of Object.entries(src)) {
      const next = v ?? "";
      if (!next.trim()) continue;
      const prev = out[k] ?? "";
      if (next.length >= prev.length) out[k] = next;
    }
  }
  return out;
}
