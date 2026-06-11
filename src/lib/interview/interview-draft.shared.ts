const DRAFT_PREFIX = "alyson:interview-draft:";

export function interviewDraftStorageKey(token: string): string {
  return `${DRAFT_PREFIX}${token}`;
}

export function loadLocalInterviewDraft(token: string): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(interviewDraftStorageKey(token));
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

export function saveLocalInterviewDraft(
  token: string,
  answers: Record<string, string>,
): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(interviewDraftStorageKey(token), JSON.stringify(answers));
  } catch {
    /* quota / private mode */
  }
}

export function clearLocalInterviewDraft(token: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(interviewDraftStorageKey(token));
  } catch {
    /* ignore */
  }
}

/** Align answer keys to the question ids currently shown (handles version-id aliases). */
export function alignAnswerKeys(
  answers: Record<string, string>,
  questionIds: string[],
  aliases: Record<string, string> = {},
): Record<string, string> {
  const allowed = new Set(questionIds);
  const out: Record<string, string> = {};
  for (const [rawKey, value] of Object.entries(answers)) {
    const text = value ?? "";
    if (!text.trim()) continue;
    const key = aliases[rawKey] ?? rawKey;
    if (allowed.has(key)) out[key] = text;
  }
  return out;
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
