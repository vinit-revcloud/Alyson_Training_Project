import { z } from "zod";

export const LevelSchema = z.enum(["Beginner", "Intermediate", "Advanced"]);
export type Level = z.infer<typeof LevelSchema>;

export const ClassStatusSchema = z.enum(["draft", "in-review", "published"]);
export type ClassStatus = z.infer<typeof ClassStatusSchema>;

export const TestConfigSchema = z.object({
  difficulty: LevelSchema,
  mcqCount: z.number().int().min(1).max(50),
  subjectiveCount: z.number().int().min(0).max(20),
  passMark: z.number().int().min(50).max(100),
  retest: z.boolean().optional(),
});

/** Relaxed test config for draft saves (finalize skipped). */
export const DraftTestConfigSchema = z.object({
  difficulty: LevelSchema,
  mcqCount: z.number().int().min(0).max(50),
  subjectiveCount: z.number().int().min(0).max(20),
  passMark: z.number().int().min(0).max(100),
  retest: z.boolean().optional(),
});

export type TestConfig = z.infer<typeof TestConfigSchema>;

export interface SectionDraftLike {
  title: string;
  description?: string;
  durationMin: number;
  objectives?: string;
  videoFile?: File | null;
  videoLink?: string;
  documents?: File[];
  transcripts?: File[];
}

export interface ClassWizardInput {
  name: string;
  parentCourse: string;
  topics: string[];
  sections: SectionDraftLike[];
  test: TestConfig;
}

export interface ValidationIssue {
  step: number;
  message: string;
}

/** Step 0–4 wizard validation (blocks Continue + publish). */
export function validateWizardSteps(input: {
  name: string;
  topics: string[];
  sections: SectionDraftLike[];
}): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!input.name.trim()) issues.push({ step: 0, message: "Class needs a name" });
  if (!input.topics.length) issues.push({ step: 1, message: "Assign at least one topic" });
  if (!input.sections.length) {
    issues.push({ step: 2, message: "Add at least one section" });
  } else {
    input.sections.forEach((s, i) => {
      const label = s.title?.trim() || `Section ${i + 1}`;
      if (!s.title?.trim()) issues.push({ step: 2, message: `Section ${i + 1} needs a title` });
      if (s.durationMin <= 0) issues.push({ step: 2, message: `${label} needs a duration` });
      const hasVideo = Boolean(s.videoFile) || Boolean(s.videoLink?.trim());
      if (!hasVideo) issues.push({ step: 3, message: `Add a video or link for "${label}"` });
      if (!(s.documents?.length ?? 0)) {
        issues.push({ step: 4, message: `Attach at least one document to "${label}"` });
      }
    });
  }
  return issues;
}

/** Step 5 — final test calibration. */
export function validateTestStep(test: Partial<TestConfig>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const parsed = TestConfigSchema.safeParse(normalizeTestConfig(test));
  if (!parsed.success) {
    for (const err of parsed.error.issues) {
      issues.push({ step: 5, message: err.message });
    }
    return issues;
  }
  const total = parsed.data.mcqCount + parsed.data.subjectiveCount;
  if (total < 5) {
    issues.push({ step: 5, message: "Final test needs at least 5 questions total (MCQ + subjective)" });
  }
  return issues;
}

/** Full publish/submit validation (wizard + test). */
export function validateClassForPublish(input: ClassWizardInput): ValidationIssue[] {
  return [...validateWizardSteps(input), ...validateTestStep(input.test)];
}

/** Minimum check before draft save. */
export function validateClassForDraft(name: string): ValidationIssue[] {
  if (!name.trim()) return [{ step: 0, message: "Class needs a name to save as draft" }];
  return [];
}

export function normalizeTestConfig(test: Partial<TestConfig>): TestConfig {
  return {
    difficulty: test.difficulty ?? "Beginner",
    mcqCount: Math.max(1, Math.min(50, Math.floor(Number(test.mcqCount) || 1))),
    subjectiveCount: Math.max(0, Math.min(20, Math.floor(Number(test.subjectiveCount) || 0))),
    passMark: Math.max(50, Math.min(100, Math.floor(Number(test.passMark) || 75))),
    retest: test.retest ?? true,
  };
}

/** Validate AI syllabus draft before applying to wizard. */
export function validateAISyllabusDraft(draft: {
  title?: string;
  description?: string;
  topics?: string[];
  sections?: Array<{ title?: string; durationMin?: number }>;
}): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!draft.title?.trim()) issues.push({ step: 0, message: "AI draft needs a class title" });
  if (!draft.description?.trim()) issues.push({ step: 0, message: "AI draft needs a description" });
  if (!(draft.topics?.length ?? 0)) issues.push({ step: 1, message: "AI draft needs at least one topic" });
  const sections = draft.sections ?? [];
  if (sections.length < 1) {
    issues.push({ step: 2, message: "AI draft needs at least one section" });
  } else {
    sections.forEach((s, i) => {
      if (!s.title?.trim()) issues.push({ step: 2, message: `AI section ${i + 1} needs a title` });
    });
  }
  return issues;
}

export function isReadyToApplyDraft(draft: {
  title?: string;
  sections?: unknown[];
}): boolean {
  return Boolean(draft.title?.trim()) && (draft.sections?.length ?? 0) >= 3;
}
