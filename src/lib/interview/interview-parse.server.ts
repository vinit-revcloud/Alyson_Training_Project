import { parseAiEvaluation, parseInPersonFlow, parsePaperAssessment } from "./interview.shared";

export { parseAiEvaluation };

export function normalizeSessionRow<T extends Record<string, unknown>>(row: T): T {
  const out = { ...row };
  if (!("assessment_mode" in out) || out.assessment_mode == null) {
    out.assessment_mode = "online" as T["assessment_mode"];
  }
  if ("ai_evaluation" in out && out.ai_evaluation != null) {
    const parsed = parseAiEvaluation(out.ai_evaluation);
    out.ai_evaluation = (parsed ?? out.ai_evaluation) as T["ai_evaluation"];
  }
  if ("in_person_flow" in out) {
    out.in_person_flow = parseInPersonFlow(out.in_person_flow) as T["in_person_flow"];
  }
  if ("paper_assessment" in out) {
    out.paper_assessment = parsePaperAssessment(out.paper_assessment) as T["paper_assessment"];
  }
  if ("final_score" in out && out.final_score != null) {
    out.final_score = Number(out.final_score) as T["final_score"];
  }
  if ("hr_override_score" in out && out.hr_override_score != null) {
    out.hr_override_score = Number(out.hr_override_score) as T["hr_override_score"];
  }
  for (const key of ["scheduled_at", "expires_at", "opened_at", "created_at", "updated_at"] as const) {
    if (key in out && out[key] instanceof Date) {
      out[key] = (out[key] as Date).toISOString() as T[typeof key];
    }
  }
  return out;
}
