import {
  autoAssignCourseToDepartmentFn,
  createManualAssignmentFn,
  getAssignmentMetricsFn,
  listAssignmentsFn,
} from "@/lib/assignments.functions";

export type AssignmentStatus =
  | "assigned"
  | "in_progress"
  | "passed"
  | "failed_capped"
  | "expired";

export interface AssignmentRow {
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
  created_at: string;
  updated_at: string;
}

export interface AssignmentDetail extends AssignmentRow {
  learner: { display_name: string | null; email: string | null; department: string | null };
  assessment: { title: string; pass_mark: number; class_id: string };
  course: { title: string } | null;
}

export async function listAssignments(): Promise<AssignmentDetail[]> {
  return listAssignmentsFn();
}

export async function createManualAssignment(input: {
  learnerUserId: string;
  assessmentId: string;
  courseId?: string | null;
  dueAt?: string;
  maxAttempts?: number;
}): Promise<void> {
  await createManualAssignmentFn({ data: input });
}

export async function autoAssignCourseToDepartment(
  courseId: string,
  department: string,
): Promise<{
  usersTouched: number;
  assignmentsCreated: number;
  emailsQueued?: number;
}> {
  return autoAssignCourseToDepartmentFn({ data: { courseId, department } });
}

export async function recordAttemptResult(
  attemptId: string,
  score: number,
  passed: boolean,
): Promise<void> {
  const { supabase } = await import("@/integrations/neon/client");
  const { error } = await supabase.rpc("record_attempt_result", {
    _attempt_id: attemptId,
    _score: score,
    _passed: passed,
  });
  if (error) throw new Error(error.message);
}

export interface AssignmentMetrics {
  total: number;
  assigned: number;
  in_progress: number;
  passed: number;
  failed_capped: number;
  expired: number;
  completionPct: number;
  failureRetakeRate: number;
  scoresByDepartment: Array<{ department: string; avgScore: number; attempts: number }>;
  scoreDistribution: Array<{ bucket: string; count: number }>;
}

export async function getAssignmentMetrics(): Promise<AssignmentMetrics> {
  return getAssignmentMetricsFn();
}
