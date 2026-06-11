export type AssessmentMode = "online" | "paper_only" | "hybrid";

export const ASSESSMENT_MODE_LABELS: Record<AssessmentMode, string> = {
  online: "Online (magic link)",
  paper_only: "Paper only",
  hybrid: "Online + paper",
};

export type InterviewSessionStatus =
  | "scheduled"
  | "waiting"
  | "opened"
  | "in_progress"
  | "submitted"
  | "evaluating"
  | "evaluated"
  | "cancelled"
  | "expired";

export type HireRecommendation = "strong_hire" | "hire" | "borderline" | "no_hire";

export type ProfileDimensionKey =
  | "iq_reasoning"
  | "math"
  | "reading_comprehension"
  | "critical_thinking"
  | "writing_ability"
  | "personality_work_style"
  | "role_specific_knowledge";

export const PROFILE_DIMENSION_DEFS: { key: ProfileDimensionKey; label: string }[] = [
  { key: "iq_reasoning", label: "IQ / Reasoning" },
  { key: "math", label: "Math" },
  { key: "reading_comprehension", label: "Reading Comprehension" },
  { key: "critical_thinking", label: "Critical Thinking" },
  { key: "writing_ability", label: "Writing Ability" },
  { key: "personality_work_style", label: "Personality / Work Style" },
  { key: "role_specific_knowledge", label: "Role-Specific Knowledge" },
];

export interface ProfileDimensionScore {
  key: ProfileDimensionKey;
  label: string;
  score: number;
  summary: string;
  evidence: string[];
}

export type InPersonStageStatus = "pending" | "in_progress" | "completed" | "skipped";

export interface InPersonStage {
  id: string;
  label: string;
  description: string;
  status: InPersonStageStatus;
  notes: string;
  score: number | null;
  completed_at: string | null;
}

export interface InPersonFlow {
  stages: InPersonStage[];
}

export const DEFAULT_IN_PERSON_FLOW: InPersonFlow = {
  stages: [
    {
      id: "office_arrival",
      label: "Office arrival & welcome",
      description: "Candidate arrives, ID check, brief orientation.",
      status: "pending",
      notes: "",
      score: null,
      completed_at: null,
    },
    {
      id: "written_test",
      label: "Written / paper test",
      description: "Candidate completes the assessment (digital or paper).",
      status: "pending",
      notes: "",
      score: null,
      completed_at: null,
    },
    {
      id: "team_meet",
      label: "Team meet & greet",
      description: "Introduction to team members and workspace tour.",
      status: "pending",
      notes: "",
      score: null,
      completed_at: null,
    },
    {
      id: "lunch",
      label: "Lunch (optional)",
      description: "Informal lunch to observe communication and rapport.",
      status: "pending",
      notes: "",
      score: null,
      completed_at: null,
    },
    {
      id: "verbal_interview",
      label: "Verbal interview & fit",
      description: "Structured interview on experience, communication, and culture fit.",
      status: "pending",
      notes: "",
      score: null,
      completed_at: null,
    },
  ],
};

export interface PaperUpload {
  id: string;
  storage_path: string;
  filename: string;
  uploaded_at: string;
  uploaded_by?: string | null;
}

export interface PaperAssessment {
  uploads: PaperUpload[];
  extracted_text?: string;
  overall_score?: number;
  summary?: string;
  profile_dimensions?: ProfileDimensionScore[];
  graded_at?: string;
  status?: "pending" | "graded";
}

export function recommendationFromScore(score: number): HireRecommendation {
  if (score >= 80) return "strong_hire";
  if (score >= 65) return "hire";
  if (score >= 50) return "borderline";
  return "no_hire";
}

export interface InterviewSessionRow {
  id: string;
  assessment_id: string;
  assessment_mode: AssessmentMode;
  candidate_id: string;
  candidate_name: string;
  candidate_email: string;
  role: string;
  level: string;
  scheduled_at: string;
  expires_at: string;
  status: InterviewSessionStatus;
  opened_at: string | null;
  opened_by: string | null;
  attempt_id: string | null;
  proctor_notes: string;
  interview_events: unknown[];
  in_person_flow: InPersonFlow;
  paper_assessment: PaperAssessment | null;
  ai_evaluation: AiEvaluation | null;
  final_score: number | null;
  final_recommendation: HireRecommendation | null;
  hr_override_score: number | null;
  hr_override_notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AiQuestionEval {
  question_id: string;
  prompt: string;
  type: "mcq" | "subjective";
  score: number;
  max_score: number;
  feedback: string;
  is_correct?: boolean;
}

export type EvaluationMode = "ai" | "heuristic" | "mixed";

export interface AiEvaluation {
  mcq_score: number;
  subjective_score: number;
  weighted_score: number;
  recommendation: HireRecommendation;
  strengths: string[];
  weaknesses: string[];
  red_flags: string[];
  summary: string;
  questions: AiQuestionEval[];
  evaluated_at: string;
  evaluation_mode?: EvaluationMode;
  profile_dimensions?: ProfileDimensionScore[];
  personality_summary?: string;
  communication_fit?: string;
  overall_profile?: string;
  in_person_synthesis?: string;
  paper_assessment?: PaperAssessment | null;
}

export interface PublicInterviewState {
  status: InterviewSessionStatus;
  candidate_name: string;
  scheduled_at: string;
  expires_at: string;
  assessment_title: string;
  duration_min: number;
  question_count: number;
  role: string;
  level: string;
  /** When the candidate started the attempt (ISO); used for timer. */
  attempt_started_at: string | null;
}

export interface InterviewSessionListItem extends InterviewSessionRow {
  assessment_title: string;
  question_count?: number;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function parseAiEvaluation(raw: unknown): AiEvaluation | null {
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      return parseAiEvaluation(JSON.parse(raw));
    } catch {
      return null;
    }
  }
  if (typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const weighted = num(o.weighted_score);
  if (weighted == null || !Array.isArray(o.questions)) return null;

  const questions = (o.questions as Record<string, unknown>[]).map((q) => ({
    question_id: String(q.question_id ?? ""),
    prompt: String(q.prompt ?? ""),
    type: (q.type === "mcq" ? "mcq" : "subjective") as "mcq" | "subjective",
    score: num(q.score) ?? 0,
    max_score: num(q.max_score) ?? 100,
    feedback: String(q.feedback ?? ""),
    ...(q.is_correct != null ? { is_correct: Boolean(q.is_correct) } : {}),
  }));

  const rec = o.recommendation;
  const recommendation =
    rec === "strong_hire" || rec === "hire" || rec === "borderline" || rec === "no_hire"
      ? rec
      : "borderline";

  return {
    mcq_score: num(o.mcq_score) ?? 0,
    subjective_score: num(o.subjective_score) ?? 0,
    weighted_score: weighted,
    recommendation,
    strengths: Array.isArray(o.strengths) ? o.strengths.map(String) : [],
    weaknesses: Array.isArray(o.weaknesses) ? o.weaknesses.map(String) : [],
    red_flags: Array.isArray(o.red_flags) ? o.red_flags.map(String) : [],
    summary: String(o.summary ?? ""),
    questions,
    evaluated_at: String(o.evaluated_at ?? new Date().toISOString()),
    evaluation_mode:
      o.evaluation_mode === "ai" || o.evaluation_mode === "heuristic" || o.evaluation_mode === "mixed"
        ? o.evaluation_mode
        : undefined,
    profile_dimensions: parseProfileDimensions(o.profile_dimensions),
    personality_summary: typeof o.personality_summary === "string" ? o.personality_summary : undefined,
    communication_fit: typeof o.communication_fit === "string" ? o.communication_fit : undefined,
    overall_profile: typeof o.overall_profile === "string" ? o.overall_profile : undefined,
    in_person_synthesis: typeof o.in_person_synthesis === "string" ? o.in_person_synthesis : undefined,
    paper_assessment: parsePaperAssessment(o.paper_assessment),
  };
}

/** Client-safe: accept raw JSON or already-parsed evaluation from server. */
export function resolveAiEvaluation(raw: unknown): AiEvaluation | null {
  if (!raw) return null;
  const parsed = parseAiEvaluation(raw);
  if (parsed?.profile_dimensions?.length) return parsed;

  if (typeof raw !== "object" || raw === null) return parsed;

  const o = raw as Record<string, unknown>;
  const dims = parseProfileDimensions(o.profile_dimensions);
  if (!dims?.length) return parsed;

  if (parsed) return { ...parsed, profile_dimensions: dims };

  const weighted = num(o.weighted_score);
  if (weighted == null) return parsed;

  const rec = o.recommendation;
  const recommendation =
    rec === "strong_hire" || rec === "hire" || rec === "borderline" || rec === "no_hire"
      ? rec
      : "borderline";

  return {
    mcq_score: num(o.mcq_score) ?? 0,
    subjective_score: num(o.subjective_score) ?? 0,
    weighted_score: weighted,
    recommendation,
    strengths: Array.isArray(o.strengths) ? o.strengths.map(String) : [],
    weaknesses: Array.isArray(o.weaknesses) ? o.weaknesses.map(String) : [],
    red_flags: Array.isArray(o.red_flags) ? o.red_flags.map(String) : [],
    summary: String(o.summary ?? ""),
    questions: Array.isArray(o.questions)
      ? (o.questions as Record<string, unknown>[]).map((q) => ({
          question_id: String(q.question_id ?? ""),
          prompt: String(q.prompt ?? ""),
          type: (q.type === "mcq" ? "mcq" : "subjective") as "mcq" | "subjective",
          score: num(q.score) ?? 0,
          max_score: num(q.max_score) ?? 100,
          feedback: String(q.feedback ?? ""),
          ...(q.is_correct != null ? { is_correct: Boolean(q.is_correct) } : {}),
        }))
      : [],
    evaluated_at: String(o.evaluated_at ?? new Date().toISOString()),
    evaluation_mode:
      o.evaluation_mode === "ai" || o.evaluation_mode === "heuristic" || o.evaluation_mode === "mixed"
        ? o.evaluation_mode
        : undefined,
    profile_dimensions: dims,
    personality_summary: typeof o.personality_summary === "string" ? o.personality_summary : undefined,
    communication_fit: typeof o.communication_fit === "string" ? o.communication_fit : undefined,
    overall_profile: typeof o.overall_profile === "string" ? o.overall_profile : undefined,
    in_person_synthesis: typeof o.in_person_synthesis === "string" ? o.in_person_synthesis : undefined,
    paper_assessment: parsePaperAssessment(o.paper_assessment),
  };
}

function parseProfileDimensions(raw: unknown): ProfileDimensionScore[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const keys = new Set(PROFILE_DIMENSION_DEFS.map((d) => d.key));
  const parsed = raw
    .filter((item): item is Record<string, unknown> => item != null && typeof item === "object")
    .map((item) => {
      const key = String(item.key ?? "") as ProfileDimensionKey;
      if (!keys.has(key)) return null;
      const def = PROFILE_DIMENSION_DEFS.find((d) => d.key === key)!;
      return {
        key,
        label: def.label,
        score: Math.min(100, Math.max(0, num(item.score) ?? 0)),
        summary: String(item.summary ?? ""),
        evidence: Array.isArray(item.evidence) ? item.evidence.map(String).slice(0, 8) : [],
      };
    })
    .filter((x): x is ProfileDimensionScore => x != null);
  return parsed.length ? parsed : undefined;
}

export function parseInPersonFlow(raw: unknown): InPersonFlow {
  if (!raw) return DEFAULT_IN_PERSON_FLOW;
  if (typeof raw === "string") {
    try {
      return parseInPersonFlow(JSON.parse(raw));
    } catch {
      return DEFAULT_IN_PERSON_FLOW;
    }
  }
  if (typeof raw !== "object" || !Array.isArray((raw as InPersonFlow).stages)) {
    return DEFAULT_IN_PERSON_FLOW;
  }
  const stages = (raw as InPersonFlow).stages.map((s, i) => {
    const fallback = DEFAULT_IN_PERSON_FLOW.stages[i] ?? DEFAULT_IN_PERSON_FLOW.stages[0];
    const status =
      s.status === "completed" ||
      s.status === "in_progress" ||
      s.status === "skipped" ||
      s.status === "pending"
        ? s.status
        : "pending";
    return {
      id: s.id || fallback.id,
      label: s.label || fallback.label,
      description: s.description || fallback.description,
      status,
      notes: s.notes ?? "",
      score: num(s.score),
      completed_at: s.completed_at ?? null,
    };
  });
  return { stages };
}

export function parsePaperAssessment(raw: unknown): PaperAssessment | null {
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      return parsePaperAssessment(JSON.parse(raw));
    } catch {
      return null;
    }
  }
  if (typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const uploads = Array.isArray(o.uploads)
    ? o.uploads
        .filter((u): u is Record<string, unknown> => u != null && typeof u === "object")
        .map((u) => ({
          id: String(u.id ?? ""),
          storage_path: String(u.storage_path ?? ""),
          filename: String(u.filename ?? "photo.jpg"),
          uploaded_at: String(u.uploaded_at ?? new Date().toISOString()),
          uploaded_by: u.uploaded_by != null ? String(u.uploaded_by) : null,
        }))
        .filter((u) => u.id && u.storage_path)
    : [];
  return {
    uploads,
    extracted_text: typeof o.extracted_text === "string" ? o.extracted_text : undefined,
    overall_score: num(o.overall_score) ?? undefined,
    summary: typeof o.summary === "string" ? o.summary : undefined,
    profile_dimensions: parseProfileDimensions(o.profile_dimensions),
    graded_at: typeof o.graded_at === "string" ? o.graded_at : undefined,
    status: o.status === "graded" ? "graded" : "pending",
  };
}
