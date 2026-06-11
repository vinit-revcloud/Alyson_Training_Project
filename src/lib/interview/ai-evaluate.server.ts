import { getPgPool } from "@/lib/pg.server";
import { llmChatCompletion } from "@/lib/ai/llm";
import type { AiEvaluation, EvaluationMode, HireRecommendation } from "./interview.shared";
import { parseAiEvaluation, parseInPersonFlow, parsePaperAssessment } from "./interview.shared";
import { synthesizeCandidateProfile, applyProfileToEvaluation } from "./profile-evaluate.server";
import { insertEvaluationRun, nextEvaluationRunNumber } from "./evaluation-audit.server";
import { canonicalQuestionId, loadVersionQuestions } from "./assessment-version.server";

interface QuestionRow {
  id: string;
  type: string;
  prompt: string;
  topic: string | null;
  rubric: string | null;
  correct_answer: string | null;
}

interface AnswerRow {
  question_id: string;
  answer: string;
}

const RECOMMENDATIONS = new Set<HireRecommendation>([
  "strong_hire",
  "hire",
  "borderline",
  "no_hire",
]);

function recommendationFromScore(score: number): HireRecommendation {
  if (score >= 80) return "strong_hire";
  if (score >= 65) return "hire";
  if (score >= 50) return "borderline";
  return "no_hire";
}

function computeWeightedScore(
  mcqScore: number,
  subjectiveScore: number,
  mcqTotal: number,
  subjTotal: number,
  mcqWeight: number,
  subjWeight: number,
): number {
  if (mcqTotal === 0 && subjTotal === 0) return 0;
  if (mcqTotal === 0) return subjectiveScore;
  if (subjTotal === 0) return mcqScore;
  const weightSum = mcqWeight + subjWeight;
  return weightSum > 0
    ? Math.round((mcqScore * mcqWeight + subjectiveScore * subjWeight) / weightSum)
    : mcqScore;
}

async function gradeSubjectiveBatch(opts: {
  role: string;
  level: string;
  items: { question_id: string; prompt: string; rubric: string; answer: string }[];
}): Promise<{ grades: Map<string, { score: number; feedback: string }>; usedAi: boolean }> {
  const out = new Map<string, { score: number; feedback: string }>();
  if (!opts.items.length) return { grades: out, usedAi: true };

  let usedAi = false;
  const payload = opts.items.map((item, i) => ({
    index: i,
    question_id: item.question_id,
    prompt: item.prompt.slice(0, 1500),
    rubric: item.rubric.slice(0, 800),
    answer: item.answer.slice(0, 4000),
  }));

  try {
    const raw = await llmChatCompletion({
      system: `You grade technical interview answers for a ${opts.level} ${opts.role} candidate. Return JSON only: { "grades": [ { "question_id": "uuid", "score": 0-100, "feedback": "2-3 sentences" } ] }. Be fair but rigorous.`,
      user: JSON.stringify({ questions: payload }, null, 2),
      jsonMode: true,
      maxTokens: 4096,
    });
    const parsed = JSON.parse(raw) as {
      grades?: { question_id?: string; score?: number; feedback?: string }[];
    };
    for (const g of parsed.grades ?? []) {
      if (!g.question_id) continue;
      out.set(g.question_id, {
        score: Math.min(100, Math.max(0, Math.round(Number(g.score) || 0))),
        feedback: g.feedback?.trim() || "Graded by AI.",
      });
    }
    usedAi = out.size > 0;
  } catch (e) {
    console.warn("[interview-ai] batch subjective grade failed", e);
  }

  for (const item of opts.items) {
    if (!out.has(item.question_id)) {
      const len = item.answer.trim().length;
      out.set(item.question_id, {
        score: len > 200 ? 40 : len > 50 ? 25 : 0,
        feedback:
          len > 10
            ? "AI batch grading unavailable — scored heuristically on answer length and structure."
            : "No substantive answer provided.",
      });
    }
  }
  return { grades: out, usedAi };
}

export async function evaluateInterviewSession(
  sessionId: string,
  opts?: { force?: boolean; triggeredBy?: string | null },
): Promise<AiEvaluation> {
  const pool = getPgPool();
  const client = await pool.connect();

  let session: {
    assessment_id: string;
    assessment_version_id: string | null;
    attempt_id: string;
    role: string;
    level: string;
    candidate_name: string;
    proctor_notes: string;
    in_person_flow: unknown;
    paper_assessment: unknown;
  };

  try {
    await client.query("BEGIN");
    const { rows: locked } = await client.query<{
      status: string;
      ai_evaluation: unknown;
      assessment_id: string;
      assessment_version_id: string | null;
      attempt_id: string | null;
      role: string;
      level: string;
      candidate_name: string;
      proctor_notes: string;
      in_person_flow: unknown;
      paper_assessment: unknown;
    }>(
      `SELECT status, ai_evaluation, assessment_id, assessment_version_id, attempt_id, role, level,
              candidate_name, proctor_notes, in_person_flow, paper_assessment
       FROM interview_sessions WHERE id = $1 FOR UPDATE`,
      [sessionId],
    );
    const row = locked[0];
    if (!row?.attempt_id) throw new Error("No attempt linked to session.");

    const existing = parseAiEvaluation(row.ai_evaluation);
    const needsProfileBackfill =
      row.status === "evaluated" &&
      existing != null &&
      (existing.profile_dimensions?.length ?? 0) < 7;

    if (row.status === "evaluated" && existing && !opts?.force && !needsProfileBackfill) {
      await client.query("COMMIT");
      return existing;
    }
    if (row.status === "evaluating" && !opts?.force) {
      await client.query("COMMIT");
      throw new Error("Evaluation already in progress.");
    }

    const allowed = opts?.force
      ? ["submitted", "evaluating", "evaluated"]
      : needsProfileBackfill
        ? ["evaluated"]
        : ["submitted"];
    if (!allowed.includes(row.status)) {
      throw new Error(`Cannot evaluate session in status "${row.status}".`);
    }

    await client.query(
      `UPDATE interview_sessions SET status = 'evaluating', updated_at = now() WHERE id = $1`,
      [sessionId],
    );
    await client.query("COMMIT");
    session = {
      assessment_id: row.assessment_id,
      assessment_version_id: row.assessment_version_id,
      attempt_id: row.attempt_id,
      role: row.role,
      level: row.level,
      candidate_name: row.candidate_name,
      proctor_notes: row.proctor_notes ?? "",
      in_person_flow: row.in_person_flow,
      paper_assessment: row.paper_assessment,
    };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }

  try {
    const { rows: assessmentRows } = await pool.query<{
      interview_weight_mcq: number;
      interview_weight_subjective: number;
      title: string;
    }>(
      `SELECT interview_weight_mcq, interview_weight_subjective, title FROM assessments WHERE id = $1`,
      [session.assessment_id],
    );
    const assessment = assessmentRows[0];
    const mcqWeight = assessment?.interview_weight_mcq ?? 40;
    const subjWeight = assessment?.interview_weight_subjective ?? 60;

    let questions: QuestionRow[] = [];
    if (session.assessment_version_id) {
      const versionQs = await loadVersionQuestions(session.assessment_version_id);
      questions = versionQs.map((q) => ({
        id: canonicalQuestionId(q),
        type: q.type,
        prompt: q.prompt,
        topic: q.topic,
        rubric: q.rubric,
        correct_answer: q.correct_answer,
      }));
    } else {
      const { rows } = await pool.query<QuestionRow>(
        `SELECT id, type, prompt, topic, rubric, correct_answer FROM assessment_questions WHERE assessment_id = $1`,
        [session.assessment_id],
      );
      questions = rows;
    }

    const { rows: answers } = await pool.query<AnswerRow>(
      `SELECT question_id, answer FROM attempt_answers WHERE attempt_id = $1`,
      [session.attempt_id],
    );
    const answerMap = new Map(answers.map((a) => [a.question_id, a.answer]));

    const questionEvals: AiEvaluation["questions"] = [];
    let mcqTotal = 0;
    let mcqCorrect = 0;
    const subjectiveBatch: {
      question_id: string;
      prompt: string;
      rubric: string;
      answer: string;
    }[] = [];

    for (const q of questions) {
      const given = (answerMap.get(q.id) ?? "").trim();
      if (q.type === "mcq") {
        mcqTotal += 1;
        const expected = (q.correct_answer ?? "").trim().toLowerCase();
        const isCorrect = given.toLowerCase() === expected && given.length > 0;
        if (isCorrect) mcqCorrect += 1;
        const score = isCorrect ? 100 : 0;
        questionEvals.push({
          question_id: q.id,
          prompt: q.prompt,
          type: "mcq",
          score,
          max_score: 100,
          feedback: isCorrect ? "Correct." : "Incorrect.",
          is_correct: isCorrect,
        });
        await pool.query(
          `UPDATE attempt_answers SET is_correct = $3, score = $4 WHERE attempt_id = $1 AND question_id = $2`,
          [session.attempt_id, q.id, isCorrect, score],
        );
      } else if (given.length > 0) {
        subjectiveBatch.push({
          question_id: q.id,
          prompt: q.prompt,
          rubric: q.rubric ?? "Evaluate completeness, accuracy, and depth.",
          answer: given,
        });
      } else {
        questionEvals.push({
          question_id: q.id,
          prompt: q.prompt,
          type: "subjective",
          score: 0,
          max_score: 100,
          feedback: "No answer provided.",
        });
        await pool.query(
          `UPDATE attempt_answers SET score = $3 WHERE attempt_id = $1 AND question_id = $2`,
          [session.attempt_id, q.id, 0],
        );
      }
    }

    const { grades: subjectiveGrades, usedAi: subjectiveUsedAi } = await gradeSubjectiveBatch({
      role: session.role,
      level: session.level,
      items: subjectiveBatch,
    });

    let subjScoreSum = 0;
    let subjTotal = 0;
    let heuristicCount = 0;
    for (const item of subjectiveBatch) {
      const grade = subjectiveGrades.get(item.question_id)!;
      subjTotal += 1;
      subjScoreSum += grade.score;
      if (grade.feedback.includes("heuristic")) heuristicCount += 1;
      questionEvals.push({
        question_id: item.question_id,
        prompt: item.prompt,
        type: "subjective",
        score: grade.score,
        max_score: 100,
        feedback: grade.feedback,
      });
      await pool.query(
        `UPDATE attempt_answers SET score = $3 WHERE attempt_id = $1 AND question_id = $2`,
        [session.attempt_id, item.question_id, grade.score],
      );
    }

    const mcqScore = mcqTotal ? Math.round((mcqCorrect / mcqTotal) * 100) : 0;
    const subjectiveScore = subjTotal ? Math.round(subjScoreSum / subjTotal) : 0;
    const weightedScore = computeWeightedScore(
      mcqScore,
      subjectiveScore,
      mcqTotal,
      subjTotal,
      mcqWeight,
      subjWeight,
    );

    let evaluationMode: EvaluationMode = "ai";
    if (!subjectiveUsedAi && subjTotal > 0) evaluationMode = "heuristic";
    else if (heuristicCount > 0) evaluationMode = "mixed";

    let recommendation: HireRecommendation = recommendationFromScore(weightedScore);
    let strengths: string[] = [];
    let weaknesses: string[] = [];
    let red_flags: string[] = [];
    let summary = "";

    try {
      const synthRaw = await llmChatCompletion({
        system: `You are a hiring advisor. Return JSON: { "recommendation": "strong_hire"|"hire"|"borderline"|"no_hire", "strengths": string[], "weaknesses": string[], "red_flags": string[], "summary": string }`,
        user: `Role: ${session.role} (${session.level})
Candidate: ${session.candidate_name}
Assessment: ${assessment?.title ?? "Interview test"}
MCQ score: ${mcqScore}% (${mcqCorrect}/${mcqTotal})
Subjective average: ${subjectiveScore}%
Weighted overall: ${weightedScore}%

Per-question highlights:
${questionEvals
  .slice(0, 25)
  .map((q) => `- [${q.type}] ${q.score}/100: ${q.feedback}`)
  .join("\n")}`,
        jsonMode: true,
        maxTokens: 1024,
      });
      const synth = JSON.parse(synthRaw) as {
        recommendation?: string;
        strengths?: string[];
        weaknesses?: string[];
        red_flags?: string[];
        summary?: string;
      };
      if (synth.recommendation && RECOMMENDATIONS.has(synth.recommendation as HireRecommendation)) {
        recommendation = synth.recommendation as HireRecommendation;
      }
      strengths = synth.strengths ?? [];
      weaknesses = synth.weaknesses ?? [];
      red_flags = synth.red_flags ?? [];
      summary = synth.summary ?? "";
    } catch (e) {
      console.warn("[interview-ai] synthesis failed", e);
      summary = `Overall weighted score ${weightedScore}%. MCQ ${mcqScore}% (${mcqCorrect}/${mcqTotal}), subjective ${subjectiveScore}%. Recommendation based on score thresholds.`;
      recommendation = recommendationFromScore(weightedScore);
      evaluationMode = evaluationMode === "ai" ? "heuristic" : evaluationMode;
      weaknesses =
        weightedScore < 65
          ? ["Overall performance below hire threshold on this assessment."]
          : [];
      strengths =
        weightedScore >= 65 ? ["Met minimum composite score on this assessment."] : [];
    }

    const evaluationBase: AiEvaluation = {
      mcq_score: mcqScore,
      subjective_score: subjectiveScore,
      weighted_score: weightedScore,
      recommendation,
      strengths,
      weaknesses,
      red_flags,
      summary,
      questions: questionEvals.sort((a, b) => {
        const ai = questions.findIndex((q) => q.id === a.question_id);
        const bi = questions.findIndex((q) => q.id === b.question_id);
        return ai - bi;
      }),
      evaluated_at: new Date().toISOString(),
      evaluation_mode: evaluationMode,
    };

    const answerContexts = questions.map((q) => {
      const evalQ = questionEvals.find((e) => e.question_id === q.id);
      return {
        question_id: q.id,
        prompt: q.prompt,
        type: q.type,
        topic: q.topic ?? "",
        answer: (answerMap.get(q.id) ?? "").trim(),
        score: evalQ?.score ?? 0,
        feedback: evalQ?.feedback ?? "",
      };
    });

    const profile = await synthesizeCandidateProfile({
      role: session.role,
      level: session.level,
      candidateName: session.candidate_name,
      assessmentTitle: assessment?.title ?? "Interview assessment",
      questionEvals: evaluationBase.questions,
      answerContexts,
      proctorNotes: session.proctor_notes,
      inPersonFlow: parseInPersonFlow(session.in_person_flow),
      paperAssessment: parsePaperAssessment(session.paper_assessment),
    });

    const evaluation = applyProfileToEvaluation(
      evaluationBase,
      profile,
      parsePaperAssessment(session.paper_assessment),
    );

    await pool.query(
      `UPDATE assessment_attempts
       SET score = $2, passed = $3, status = 'graded', graded_at = now(), submitted_at = COALESCE(submitted_at, now())
       WHERE id = $1`,
      [session.attempt_id, weightedScore, weightedScore >= 65],
    );

    const runNumber = await nextEvaluationRunNumber(sessionId);
    await insertEvaluationRun({
      sessionId,
      runNumber,
      evaluation,
      evaluationMode,
      triggeredBy: opts?.triggeredBy ?? null,
    });

    await pool.query(
      `UPDATE interview_sessions
       SET status = 'evaluated', ai_evaluation = $2::jsonb, final_score = $3, final_recommendation = $4, updated_at = now()
       WHERE id = $1`,
      [sessionId, JSON.stringify(evaluation), weightedScore, recommendation],
    );

    return evaluation;
  } catch (e) {
    await pool.query(
      `UPDATE interview_sessions SET status = 'submitted', updated_at = now()
       WHERE id = $1 AND status = 'evaluating'`,
      [sessionId],
    );
    throw e;
  }
}
