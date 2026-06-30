export type AssignmentStatus =
  | "assigned"
  | "in_progress"
  | "passed"
  | "failed_capped"
  | "expired";

export interface LearnerQuestion {
  id: string;
  type: "mcq" | "subjective";
  topic: string;
  difficulty: "easy" | "medium" | "hard";
  prompt: string;
  options: string[] | null;
  position: number;
}

export interface LearnerAssignmentRow {
  id: string;
  learner_user_id: string;
  assessment_id: string;
  course_id: string | null;
  assigned_by: string | null;
  source: "manual" | "auto_department";
  mode: "final" | "practice";
  assigned_at: string;
  due_at: string;
  max_attempts: number;
  attempts_used: number;
  last_attempt_id: string | null;
  status: AssignmentStatus;
  paused_at: string | null;
  paused_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface LearnerAssessmentMeta {
  id: string;
  title: string;
  pass_mark: number;
  duration_min: number;
  description: string | null;
}

export interface ActiveAttemptState {
  attemptId: string;
  answers: Record<string, string>;
}
