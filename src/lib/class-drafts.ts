import { useSyncExternalStore } from "react";

export type ClassStatus = "draft" | "in-review" | "published";

export interface SectionRecord {
  id: string;
  title: string;
  description: string;
  durationMin: number;
  objectives: string;
  hasVideo: boolean;
  documentCount: number;
}

export interface FinalTestRecord {
  difficulty: "Beginner" | "Intermediate" | "Advanced";
  mcqCount: number;
  subjectiveCount: number;
  passMark: number;
  retest: boolean;
  status: ClassStatus;
}

export interface ClassRecord {
  id: string;
  name: string;
  parentCourse: string;
  level: "Beginner" | "Intermediate" | "Advanced";
  audience: string;
  summary: string;
  topics: string[];
  sections: SectionRecord[];
  test: FinalTestRecord;
  status: ClassStatus;
  updatedAt: string;
}

// ───────── In-memory store with subscription (SSR-safe) ─────────
let _classes: ClassRecord[] = [];
const _listeners = new Set<() => void>();

function emit() {
  _listeners.forEach((l) => l());
}

export const classDrafts = {
  getAll(): ClassRecord[] {
    return _classes;
  },
  upsert(record: ClassRecord) {
    const idx = _classes.findIndex((c) => c.id === record.id);
    const next = { ...record, updatedAt: new Date().toISOString() };
    _classes =
      idx >= 0
        ? _classes.map((c, i) => (i === idx ? next : c))
        : [next, ..._classes];
    emit();
  },
  setStatus(id: string, status: ClassStatus) {
    _classes = _classes.map((c) =>
      c.id === id
        ? {
            ...c,
            status,
            test: { ...c.test, status },
            updatedAt: new Date().toISOString(),
          }
        : c,
    );
    emit();
  },
  subscribe(l: () => void) {
    _listeners.add(l);
    return () => {
      _listeners.delete(l);
    };
  },
};

const EMPTY: ClassRecord[] = [];
export function useClassDrafts(): ClassRecord[] {
  return useSyncExternalStore(
    classDrafts.subscribe,
    () => _classes,
    () => EMPTY,
  );
}

export function statusLabel(s: ClassStatus): string {
  return s === "draft" ? "Draft" : s === "in-review" ? "In review" : "Published";
}

// ───────── Validation ─────────
export interface ValidationIssue {
  step: number; // 0-based step index
  message: string;
}

export function validateForApproval(input: {
  name: string;
  topics: string[];
  sections: SectionRecord[];
}): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!input.name.trim()) issues.push({ step: 0, message: "Class needs a name" });
  if (input.topics.length === 0)
    issues.push({ step: 1, message: "Assign at least one topic" });
  if (input.sections.length === 0) {
    issues.push({ step: 2, message: "Add at least one section" });
  } else {
    input.sections.forEach((s, i) => {
      if (!s.title.trim())
        issues.push({ step: 2, message: `Section ${i + 1} needs a title` });
      if (s.durationMin <= 0)
        issues.push({ step: 2, message: `Section ${i + 1} needs a duration` });
      if (!s.hasVideo)
        issues.push({ step: 3, message: `Upload a video for "${s.title || `Section ${i + 1}`}"` });
      if (s.documentCount === 0)
        issues.push({
          step: 4,
          message: `Attach at least one document to "${s.title || `Section ${i + 1}`}"`,
        });
    });
  }
  return issues;
}
