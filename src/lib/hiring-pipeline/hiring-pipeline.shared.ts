export const PIPELINE_STAGES = [
  "tech_round_1",
  "tech_round_2",
  "trial_project",
  "bill_review",
  "ceo_interview",
  "onboarding",
  "completed",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const INTERVIEW_ROUND_TYPES = ["tech_round_1", "tech_round_2", "ceo_interview"] as const;
export type InterviewRoundType = (typeof INTERVIEW_ROUND_TYPES)[number];

export type PipelineStatus = "active" | "hired" | "rejected" | "withdrawn";

export type StageStatus =
  | "pending"
  | "scheduled"
  | "in_progress"
  | "completed"
  | "passed"
  | "failed"
  | "skipped";

export interface PipelineRow {
  id: string;
  candidate_id: string;
  user_id: string | null;
  target_role: string;
  target_department: string;
  status: PipelineStatus;
  current_stage: PipelineStage;
  hired_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PipelineListItem extends PipelineRow {
  candidate_name: string;
  candidate_email: string;
  onboarding_pct: number | null;
}

export interface PipelineStageRow {
  id: string;
  pipeline_id: string;
  stage: PipelineStage;
  status: StageStatus;
  interview_session_id: string | null;
  trial_project_id: string | null;
  decision: string | null;
  reviewer_user_id: string | null;
  notes: string | null;
  completed_at: string | null;
}

export interface TrialProjectRow {
  id: string;
  pipeline_id: string;
  title: string;
  brief: string | null;
  team_context: string | null;
  estimated_hours: number;
  platform_access: unknown;
  due_at: string | null;
  submitted_at: string | null;
  submission_notes: string | null;
  bill_review_status: string;
  bill_notes: string | null;
}

export const STAGE_LABELS: Record<PipelineStage, string> = {
  tech_round_1: "Tech Round 1 (AI)",
  tech_round_2: "Tech Round 2 (Domain)",
  trial_project: "Trial Project (~20hr)",
  bill_review: "CEO Review",
  ceo_interview: "CEO Interview",
  onboarding: "Onboarding",
  completed: "Completed",
};

/** DB column `bill_review_status` — user-facing labels (post-trial CEO review). */
export const CEO_REVIEW_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  scheduled: "Scheduled",
  passed: "Passed",
  failed: "Failed",
};

export function ceoReviewStatusLabel(status: string): string {
  return CEO_REVIEW_STATUS_LABELS[status] ?? status.replace(/_/g, " ");
}

export const ROUND_TYPE_LABELS: Record<InterviewRoundType, string> = {
  tech_round_1: "Tech Round 1 — AI",
  tech_round_2: "Tech Round 2 — Domain",
  ceo_interview: "CEO Interview",
};

export function nextStageAfterPass(current: PipelineStage): PipelineStage | null {
  const order: PipelineStage[] = [
    "tech_round_1",
    "tech_round_2",
    "trial_project",
    "bill_review",
    "ceo_interview",
    "onboarding",
    "completed",
  ];
  const idx = order.indexOf(current);
  if (idx === -1 || idx >= order.length - 1) return null;
  return order[idx + 1];
}

/** Stages shown left-to-right on the hiring kanban (excludes terminal completed). */
export const KANBAN_STAGES: PipelineStage[] = [
  "tech_round_1",
  "tech_round_2",
  "trial_project",
  "bill_review",
  "ceo_interview",
  "onboarding",
];

export const STAGE_DESCRIPTIONS: Record<PipelineStage, string> = {
  tech_round_1: "AI & builder mindset — online proctored test",
  tech_round_2: "Domain-specific technical depth",
  trial_project: "~20hr trial aligned to team work + platform access",
  bill_review: "CEO review call after trial submission",
  ceo_interview: "Project discussion & personality fit",
  onboarding: "AI Builder + Business Process + role track",
  completed: "Hired and contributing",
};

export const STAGE_ACTION_HINTS: Record<PipelineStage, string> = {
  tech_round_1: "Schedule Tech Round 1 test",
  tech_round_2: "Schedule domain interview",
  trial_project: "Create trial & send @cintara.ai invite",
  bill_review: "Record CEO review outcome",
  ceo_interview: "Schedule CEO interview",
  onboarding: "Monitor learner dashboard",
  completed: "Archive — journey complete",
};

export const PIPELINE_STATUS_LABELS: Record<PipelineStatus, string> = {
  active: "In progress",
  hired: "Hired",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

/** Short labels for kanban column headers */
export const STAGE_SHORT_LABELS: Record<PipelineStage, string> = {
  tech_round_1: "Tech 1 · AI",
  tech_round_2: "Tech 2 · Domain",
  trial_project: "Trial · 20hr",
  bill_review: "CEO Review",
  ceo_interview: "CEO Interview",
  onboarding: "Onboarding",
  completed: "Done",
};
