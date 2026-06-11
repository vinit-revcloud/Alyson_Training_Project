import { getPgPool } from "@/lib/pg.server";
import type { AiEvaluation, EvaluationMode, HireRecommendation } from "./interview.shared";
import { getOpenRouterModel } from "@/lib/config.server";

export interface EvaluationRunRow {
  id: string;
  session_id: string;
  run_number: number;
  model_provider: string | null;
  model_name: string | null;
  prompt_summary: string | null;
  evaluation_mode: string | null;
  ai_evaluation: AiEvaluation;
  weighted_score: number | null;
  recommendation: HireRecommendation | null;
  triggered_by: string | null;
  created_at: string;
}

export async function nextEvaluationRunNumber(sessionId: string): Promise<number> {
  const pool = getPgPool();
  const { rows } = await pool.query<{ n: number }>(
    `SELECT COALESCE(max(run_number), 0) + 1 AS n FROM interview_evaluation_runs WHERE session_id = $1`,
    [sessionId],
  );
  return rows[0]?.n ?? 1;
}

/** Append immutable AI evaluation record — never updates existing rows. */
export async function insertEvaluationRun(input: {
  sessionId: string;
  runNumber: number;
  evaluation: AiEvaluation;
  evaluationMode: EvaluationMode;
  triggeredBy?: string | null;
  promptSummary?: string;
}): Promise<string> {
  const pool = getPgPool();
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO interview_evaluation_runs (
       session_id, run_number, model_provider, model_name, prompt_summary,
       evaluation_mode, ai_evaluation, weighted_score, recommendation, triggered_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10)
     RETURNING id`,
    [
      input.sessionId,
      input.runNumber,
      "openrouter/deepseek",
      getOpenRouterModel(),
      input.promptSummary ??
        "Batch subjective grading + hire recommendation synthesis with profile dimensions.",
      input.evaluationMode,
      JSON.stringify(input.evaluation),
      input.evaluation.weighted_score,
      input.evaluation.recommendation,
      input.triggeredBy ?? null,
    ],
  );
  return rows[0].id;
}

export async function listEvaluationRuns(sessionId: string): Promise<EvaluationRunRow[]> {
  const pool = getPgPool();
  const { rows } = await pool.query<EvaluationRunRow>(
    `SELECT id, session_id, run_number, model_provider, model_name, prompt_summary,
            evaluation_mode, ai_evaluation, weighted_score, recommendation, triggered_by, created_at
     FROM interview_evaluation_runs
     WHERE session_id = $1
     ORDER BY run_number DESC`,
    [sessionId],
  );
  return rows;
}
