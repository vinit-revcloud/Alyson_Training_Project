import { getPgPool } from "@/lib/pg.server";
import type { AiEvaluation, HireRecommendation, PaperAssessment } from "./interview.shared";
import { parsePaperAssessment, recommendationFromScore } from "./interview.shared";
import { insertEvaluationRun, nextEvaluationRunNumber } from "./evaluation-audit.server";
import { addSupportingScore } from "./interview-audit.server";
import { synthesizeCandidateProfile, applyProfileToEvaluation } from "./profile-evaluate.server";
import { parseInPersonFlow } from "./interview.shared";

function strengthsFromPaper(paper: PaperAssessment): string[] {
  const dims = paper.profile_dimensions ?? [];
  return dims
    .filter((d) => d.score >= 70)
    .slice(0, 4)
    .map((d) => `${d.label}: ${d.summary}`);
}

function weaknessesFromPaper(paper: PaperAssessment): string[] {
  const dims = paper.profile_dimensions ?? [];
  return dims
    .filter((d) => d.score < 55)
    .slice(0, 4)
    .map((d) => `${d.label}: ${d.summary}`);
}

function buildPaperOnlyEvaluation(
  paper: PaperAssessment,
  assessmentTitle: string,
): AiEvaluation {
  const score = Math.min(100, Math.max(0, Math.round(Number(paper.overall_score) || 0)));
  const now = new Date().toISOString();

  return {
    mcq_score: 0,
    subjective_score: score,
    weighted_score: score,
    recommendation: recommendationFromScore(score),
    strengths: strengthsFromPaper(paper),
    weaknesses: weaknessesFromPaper(paper),
    red_flags: [],
    summary:
      paper.summary?.trim() ||
      `Paper-only assessment graded at ${score}% for ${assessmentTitle}.`,
    questions: [],
    evaluated_at: now,
    evaluation_mode: "ai",
    profile_dimensions: paper.profile_dimensions ?? [],
    paper_assessment: paper,
  };
}

/**
 * Finalize a paper-only session: immutable eval run, supporting score, status = evaluated.
 * No online attempt_id required.
 */
export async function evaluatePaperOnlySession(
  sessionId: string,
  opts?: { triggeredBy?: string | null; paperAssessment?: PaperAssessment },
): Promise<AiEvaluation> {
  const pool = getPgPool();
  const { rows } = await pool.query<{
    assessment_mode: string;
    role: string;
    level: string;
    candidate_name: string;
    proctor_notes: string;
    in_person_flow: unknown;
    paper_assessment: unknown;
    assessment_title: string;
  }>(
    `SELECT s.assessment_mode, s.role, s.level, s.candidate_name, s.proctor_notes,
            s.in_person_flow, s.paper_assessment, a.title AS assessment_title
     FROM interview_sessions s
     JOIN assessments a ON a.id = s.assessment_id
     WHERE s.id = $1`,
    [sessionId],
  );
  const session = rows[0];
  if (!session) throw new Error("Session not found.");
  if (session.assessment_mode !== "paper_only") {
    throw new Error("Session is not configured for paper-only evaluation.");
  }

  const paper =
    opts?.paperAssessment ??
    parsePaperAssessment(session.paper_assessment);
  if (!paper?.uploads?.length || paper.status !== "graded") {
    throw new Error("Grade the paper test before running paper-only evaluation.");
  }

  const evaluationBase = buildPaperOnlyEvaluation(paper, session.assessment_title);

  const profile = await synthesizeCandidateProfile({
    role: session.role,
    level: session.level,
    candidateName: session.candidate_name,
    assessmentTitle: session.assessment_title,
    questionEvals: [],
    answerContexts: [],
    proctorNotes: session.proctor_notes,
    inPersonFlow: parseInPersonFlow(session.in_person_flow),
    paperAssessment: paper,
  });

  const evaluation = applyProfileToEvaluation(evaluationBase, profile, paper);
  const weightedScore = evaluation.weighted_score;
  const recommendation = evaluation.recommendation as HireRecommendation;

  const runNumber = await nextEvaluationRunNumber(sessionId);
  await insertEvaluationRun({
    sessionId,
    runNumber,
    evaluation,
    evaluationMode: "ai",
    triggeredBy: opts?.triggeredBy ?? null,
    promptSummary: "Paper-only vision grading + profile synthesis (no online attempt).",
  });

  if (opts?.triggeredBy) {
    await addSupportingScore({
      sessionId,
      scoreType: "paper_test",
      label: "Paper test (AI graded)",
      score: weightedScore,
      weightPct: 100,
      notes: paper.summary ?? null,
      evidence: { upload_count: paper.uploads.length, graded_at: paper.graded_at },
      createdBy: opts.triggeredBy,
    });
  }

  await pool.query(
    `UPDATE interview_sessions
     SET status = 'evaluated', ai_evaluation = $2::jsonb, final_score = $3,
         final_recommendation = $4, updated_at = now()
     WHERE id = $1`,
    [sessionId, JSON.stringify(evaluation), weightedScore, recommendation],
  );

  return evaluation;
}
