import type {
  AiEvaluation,
  InPersonFlow,
  PaperAssessment,
  ProfileDimensionKey,
} from "./interview.shared";
import {
  DEFAULT_IN_PERSON_FLOW,
  PROFILE_DIMENSION_DEFS,
  parseAiEvaluation,
  parseInPersonFlow,
  parsePaperAssessment,
} from "./interview.shared";
import type { AiQuestionEval } from "./interview.shared";
import { llmChatCompletion } from "@/lib/ai/llm";
import { getPgPool } from "@/lib/pg.server";
import { getInterviewSubmissionRecordFromDb } from "./interview.server";

interface QuestionContext {
  question_id: string;
  prompt: string;
  type: string;
  topic: string;
  answer: string;
  score: number;
  feedback: string;
}

function heuristicDimensionScores(
  questionEvals: AiQuestionEval[],
  role: string,
): AiEvaluation["profile_dimensions"] {
  const buckets: Record<ProfileDimensionKey, number[]> = {
    iq_reasoning: [],
    math: [],
    reading_comprehension: [],
    critical_thinking: [],
    writing_ability: [],
    personality_work_style: [],
    role_specific_knowledge: [],
  };

  for (const q of questionEvals) {
    const topic = q.prompt.toLowerCase();
    const score = q.score;
    if (/math|calcul|numeric|algebra|statistic/.test(topic)) buckets.math.push(score);
    else if (/read|comprehen|passage|literacy/.test(topic)) buckets.reading_comprehension.push(score);
    else if (/writ|essay|grammar|compose/.test(topic)) buckets.writing_ability.push(score);
    else if (/critical|analy|logic|reason/.test(topic)) buckets.critical_thinking.push(score);
    else if (/personality|behavior|team|culture|work style/.test(topic)) buckets.personality_work_style.push(score);
    else if (q.type === "subjective") buckets.writing_ability.push(score);
    else buckets.iq_reasoning.push(score);
    buckets.role_specific_knowledge.push(score);
  }

  return PROFILE_DIMENSION_DEFS.map((def) => {
    const scores = buckets[def.key];
    const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    return {
      key: def.key,
      label: def.label,
      score: avg,
      summary:
        scores.length > 0
          ? `Based on ${scores.length} response(s) mapped to ${def.label.toLowerCase()}.`
          : `Insufficient direct evidence for ${def.label.toLowerCase()} on this assessment.`,
      evidence: [],
    };
  });
}

export async function synthesizeCandidateProfile(opts: {
  role: string;
  level: string;
  candidateName: string;
  assessmentTitle: string;
  questionEvals: AiQuestionEval[];
  answerContexts: QuestionContext[];
  proctorNotes?: string;
  inPersonFlow?: InPersonFlow | null;
  paperAssessment?: PaperAssessment | null;
}): Promise<Pick<
  AiEvaluation,
  | "profile_dimensions"
  | "personality_summary"
  | "communication_fit"
  | "overall_profile"
  | "in_person_synthesis"
>> {
  const inPerson = opts.inPersonFlow ?? DEFAULT_IN_PERSON_FLOW;
  const completedStages = inPerson.stages.filter((s) => s.status === "completed");
  const inPersonNotes = completedStages
    .map((s) => `${s.label}: ${s.notes || "completed"}${s.score != null ? ` (score ${s.score}/5)` : ""}`)
    .join("\n");

  const payload = {
    role: opts.role,
    level: opts.level,
    candidate: opts.candidateName,
    assessment: opts.assessmentTitle,
    proctor_notes: opts.proctorNotes ?? "",
    in_person: inPersonNotes,
    paper_summary: opts.paperAssessment?.summary ?? "",
    responses: opts.answerContexts.slice(0, 30).map((q) => ({
      type: q.type,
      topic: q.topic,
      prompt: q.prompt.slice(0, 400),
      answer: q.answer.slice(0, 800),
      score: q.score,
      feedback: q.feedback.slice(0, 300),
    })),
    per_question: opts.questionEvals.slice(0, 30).map((q) => ({
      type: q.type,
      score: q.score,
      feedback: q.feedback,
      prompt: q.prompt.slice(0, 300),
    })),
  };

  const dimensionSpec = PROFILE_DIMENSION_DEFS.map((d) => d.key).join(", ");

  try {
    const raw = await llmChatCompletion({
      system: `You are a senior hiring assessor building a structured candidate profile for an in-person interview process.
Return JSON only with this shape:
{
  "profile_dimensions": [
    { "key": "<one of: ${dimensionSpec}>", "label": "Human label", "score": 0-100, "summary": "2-3 sentences", "evidence": ["bullet", "..."] }
  ],
  "personality_summary": "paragraph on personality and work style",
  "communication_fit": "paragraph on communication, team fit, in-person impressions",
  "overall_profile": "executive summary paragraph tying test + in-person + paper if any",
  "in_person_synthesis": "how in-person stages inform the hire decision"
}
Include ALL seven dimension keys exactly once. Be evidence-based from answers and notes.`,
      user: JSON.stringify(payload, null, 2),
      jsonMode: true,
      maxTokens: 4096,
    });

    const parsed = JSON.parse(raw) as {
      profile_dimensions?: {
        key?: string;
        label?: string;
        score?: number;
        summary?: string;
        evidence?: string[];
      }[];
      personality_summary?: string;
      communication_fit?: string;
      overall_profile?: string;
      in_person_synthesis?: string;
    };

    const byKey = new Map(
      (parsed.profile_dimensions ?? []).map((d) => [d.key, d]),
    );

    const profile_dimensions = PROFILE_DIMENSION_DEFS.map((def) => {
      const hit = byKey.get(def.key);
      return {
        key: def.key,
        label: def.label,
        score: Math.min(100, Math.max(0, Math.round(Number(hit?.score) || 0))),
        summary: hit?.summary?.trim() || `Assessment evidence for ${def.label}.`,
        evidence: Array.isArray(hit?.evidence) ? hit!.evidence!.map(String).slice(0, 5) : [],
      };
    });

    return {
      profile_dimensions,
      personality_summary: parsed.personality_summary?.trim() ?? "",
      communication_fit: parsed.communication_fit?.trim() ?? "",
      overall_profile: parsed.overall_profile?.trim() ?? "",
      in_person_synthesis: parsed.in_person_synthesis?.trim() ?? "",
    };
  } catch (e) {
    console.warn("[interview-profile] synthesis failed", e);
    const fallback = heuristicDimensionScores(opts.questionEvals, opts.role);
    return {
      profile_dimensions: fallback,
      personality_summary: "Profile synthesis unavailable — scores estimated from question performance.",
      communication_fit: opts.proctorNotes
        ? `Proctor notes: ${opts.proctorNotes.slice(0, 500)}`
        : "No in-person communication notes recorded yet.",
      overall_profile: `Composite assessment for ${opts.candidateName} (${opts.role}, ${opts.level}).`,
      in_person_synthesis: inPersonNotes || "In-person stages not yet completed.",
    };
  }
}

export function mergeProfileDimensions(
  online: AiEvaluation["profile_dimensions"],
  paper: AiEvaluation["profile_dimensions"] | undefined,
  onlineWeight = 0.65,
  paperWeight = 0.35,
): AiEvaluation["profile_dimensions"] {
  if (!paper?.length) return online;
  if (!online?.length) return paper;

  return PROFILE_DIMENSION_DEFS.map((def) => {
    const o = online.find((d) => d.key === def.key);
    const p = paper.find((d) => d.key === def.key);
    const score = Math.round((o?.score ?? 0) * onlineWeight + (p?.score ?? 0) * paperWeight);
    return {
      key: def.key,
      label: def.label,
      score,
      summary: [o?.summary, p?.summary].filter(Boolean).join(" "),
      evidence: [...(o?.evidence ?? []), ...(p?.evidence ?? [])].slice(0, 6),
    };
  });
}

export function applyProfileToEvaluation(
  evaluation: AiEvaluation,
  profile: Pick<
    AiEvaluation,
    | "profile_dimensions"
    | "personality_summary"
    | "communication_fit"
    | "overall_profile"
    | "in_person_synthesis"
  >,
  paperAssessment?: PaperAssessment | null,
): AiEvaluation {
  let profile_dimensions = profile.profile_dimensions;
  if (paperAssessment?.profile_dimensions?.length) {
    profile_dimensions = mergeProfileDimensions(
      profile.profile_dimensions,
      paperAssessment.profile_dimensions,
    );
  }

  return {
    ...evaluation,
    ...profile,
    profile_dimensions,
    paper_assessment: paperAssessment ?? evaluation.paper_assessment,
  };
}

/** Backfill structured profile report for evaluations created before profile scoring existed. */
export async function ensureInterviewProfileReport(sessionId: string): Promise<AiEvaluation | null> {
  const pool = getPgPool();
  const { rows } = await pool.query<{
    status: string;
    role: string;
    level: string;
    candidate_name: string;
    proctor_notes: string;
    in_person_flow: unknown;
    paper_assessment: unknown;
    ai_evaluation: unknown;
    assessment_title: string;
  }>(
    `SELECT s.status, s.role, s.level, s.candidate_name, s.proctor_notes,
            s.in_person_flow, s.paper_assessment, s.ai_evaluation, a.title AS assessment_title
     FROM interview_sessions s
     JOIN assessments a ON a.id = s.assessment_id
     WHERE s.id = $1`,
    [sessionId],
  );
  const row = rows[0];
  if (!row) return null;
  if (!["submitted", "evaluating", "evaluated"].includes(row.status)) return null;

  const existing = parseAiEvaluation(row.ai_evaluation);
  if (!existing) return null;
  if (existing.profile_dimensions?.length === PROFILE_DIMENSION_DEFS.length) {
    return existing;
  }

  const answers = await getInterviewSubmissionRecordFromDb(sessionId);
  const answerContexts: QuestionContext[] = answers.map((a) => {
    const evalQ = existing.questions.find((q) => q.question_id === a.question_id);
    return {
      question_id: a.question_id,
      prompt: a.prompt,
      type: a.type,
      topic: a.topic,
      answer: a.answer,
      score: evalQ?.score ?? a.score ?? 0,
      feedback: evalQ?.feedback ?? "",
    };
  });

  const profile = await synthesizeCandidateProfile({
    role: row.role,
    level: row.level,
    candidateName: row.candidate_name,
    assessmentTitle: row.assessment_title,
    questionEvals: existing.questions,
    answerContexts,
    proctorNotes: row.proctor_notes,
    inPersonFlow: parseInPersonFlow(row.in_person_flow),
    paperAssessment: parsePaperAssessment(row.paper_assessment),
  });

  const upgraded = applyProfileToEvaluation(
    existing,
    profile,
    parsePaperAssessment(row.paper_assessment),
  );

  await pool.query(
    `UPDATE interview_sessions SET ai_evaluation = $2::jsonb, updated_at = now() WHERE id = $1`,
    [sessionId, JSON.stringify(upgraded)],
  );

  return upgraded;
}

export { parseAiEvaluation, parseInPersonFlow, parsePaperAssessment };
