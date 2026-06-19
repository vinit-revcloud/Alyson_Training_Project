import {
  deleteAssessmentFn,
  duplicateAssessmentFn,
  getAssessmentAttemptSummaryFn,
  getAssessmentFn,
  getClassAssessmentFn,
  listAllAssessmentsWithStatsFn,
  listAssessmentQuestionsFn,
  publishAssessmentFn,
  saveClassAssessmentFn,
  setAssessmentStatusFn,
} from "@/lib/assessments.functions";
import type { Question } from "@/lib/test-types";

export type AssessmentStatus = "draft" | "validated" | "published" | "archived";

export interface AssessmentRow {
  id: string;
  class_id: string;
  title: string;
  description: string;
  role: string;
  difficulty: string;
  level: string;
  pass_mark: number;
  duration_min: number;
  status: AssessmentStatus;
  is_primary: boolean;
  source: string;
  created_at: string;
  updated_at: string;
}

export interface AssessmentQuestionRow {
  id: string;
  assessment_id: string;
  type: "mcq" | "subjective";
  topic: string;
  difficulty: "easy" | "medium" | "hard";
  prompt: string;
  options: string[] | null;
  correct_answer: string | null;
  rubric: string | null;
  position: number;
}

export async function getClassAssessment(classId: string): Promise<AssessmentRow | null> {
  return getClassAssessmentFn({ data: { classId } });
}

export async function getAssessment(assessmentId: string): Promise<AssessmentRow | null> {
  return getAssessmentFn({ data: { assessmentId } });
}

export async function listAssessmentQuestions(
  assessmentId: string,
): Promise<AssessmentQuestionRow[]> {
  return listAssessmentQuestionsFn({ data: { assessmentId } });
}

export interface SaveAssessmentInput {
  classId?: string;
  title: string;
  description?: string;
  role: string;
  difficulty: string;
  level: string;
  passMark: number;
  durationMin?: number;
  status: AssessmentStatus;
  questions: Question[];
  purpose?: "training" | "interview";
}

export async function saveClassAssessment(input: SaveAssessmentInput): Promise<string> {
  return saveClassAssessmentFn({ data: input });
}

export async function publishAssessment(assessmentId: string): Promise<void> {
  await publishAssessmentFn({ data: { assessmentId } });
}

export async function setAssessmentStatus(
  assessmentId: string,
  status: AssessmentStatus,
): Promise<void> {
  await setAssessmentStatusFn({ data: { assessmentId, status } });
}

export async function deleteAssessment(assessmentId: string): Promise<void> {
  await deleteAssessmentFn({ data: { assessmentId } });
}

export async function duplicateAssessment(assessmentId: string): Promise<string> {
  return duplicateAssessmentFn({ data: { assessmentId } });
}

export interface AssignAssessmentInput {
  assessmentId: string;
  learnerUserIds: string[];
  dueAt: string;
  mode?: "final" | "practice";
  maxAttempts?: number;
  courseId?: string | null;
}

export async function assignAssessment(input: AssignAssessmentInput): Promise<number> {
  if (!input.learnerUserIds.length) return 0;
  const { assignAssessmentFn } = await import("@/lib/assignments.functions");
  const dueAt =
    input.dueAt ||
    new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const result = await assignAssessmentFn({
    data: {
      assessmentId: input.assessmentId,
      learnerUserIds: input.learnerUserIds,
      dueAt,
      mode: input.mode,
      maxAttempts: input.maxAttempts,
      courseId: input.courseId,
    },
  });
  return result.count;
}

export interface AssessmentSummaryRow {
  id: string;
  title: string;
  class_id: string;
  class_name: string | null;
  course_id: string | null;
  course_title: string | null;
  role: string;
  status: AssessmentStatus;
  type: "Final" | "Practice";
  is_primary: boolean;
  purpose: "training" | "interview";
  question_count: number;
  assigned_count: number;
  completed_count: number;
  overdue_count: number;
  at_risk_count: number;
  completion: number;
  avg_score: number | null;
  updated_at: string;
  class_status: string | null;
}

export async function listAllAssessmentsWithStats(): Promise<AssessmentSummaryRow[]> {
  return listAllAssessmentsWithStatsFn();
}

export function questionRowToQuestion(r: AssessmentQuestionRow): Question {
  return {
    id: r.id,
    type: r.type,
    topic: r.topic,
    difficulty: r.difficulty,
    prompt: r.prompt,
    options: r.options ?? undefined,
    correctAnswer: r.correct_answer ?? undefined,
    rubric: r.rubric ?? undefined,
  };
}

export type AttemptStatus = "not_started" | "in_progress" | "submitted" | "graded";

export interface AttemptSummary {
  total: number;
  not_started: number;
  in_progress: number;
  submitted: number;
  graded: number;
  passed: number;
  failed: number;
  avgScore: number | null;
  lastActivity: string | null;
}

export async function getAssessmentAttemptSummary(
  assessmentId: string,
): Promise<AttemptSummary> {
  return getAssessmentAttemptSummaryFn({ data: { assessmentId } });
}
