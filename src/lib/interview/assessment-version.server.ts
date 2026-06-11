import { getPgPool } from "@/lib/pg.server";

export interface QuestionSnapshot {
  source_question_id: string;
  type: string;
  topic: string | null;
  difficulty: string | null;
  prompt: string;
  options: unknown;
  rubric: string | null;
  correct_answer: string | null;
  position: number;
}

export interface QuestionOrderSnapshot {
  question_ids: string[];
  option_orders: Record<string, number[]>;
}

/** FK target for attempt_answers — always assessment_questions.id when snapshotted. */
export function canonicalQuestionId(q: {
  id: string;
  source_question_id: string | null;
}): string {
  return q.source_question_id ?? q.id;
}

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Snapshot current assessment into a new immutable version row. */
export async function snapshotAssessmentVersion(
  assessmentId: string,
  snapshottedBy?: string | null,
): Promise<string> {
  const pool = getPgPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: assRows } = await client.query<{
      title: string;
      duration_min: number | null;
      interview_weight_mcq: number;
      interview_weight_subjective: number;
    }>(
      `SELECT title, duration_min, interview_weight_mcq, interview_weight_subjective
       FROM assessments WHERE id = $1 FOR UPDATE`,
      [assessmentId],
    );
    const ass = assRows[0];
    if (!ass) throw new Error("Assessment not found.");

    const { rows: verRows } = await client.query<{ n: number }>(
      `SELECT COALESCE(max(version_number), 0) + 1 AS n FROM assessment_versions WHERE assessment_id = $1`,
      [assessmentId],
    );
    const versionNumber = verRows[0]?.n ?? 1;

    const { rows: versionInsert } = await client.query<{ id: string }>(
      `INSERT INTO assessment_versions (
         assessment_id, version_number, title, duration_min,
         interview_weight_mcq, interview_weight_subjective, snapshotted_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id`,
      [
        assessmentId,
        versionNumber,
        ass.title,
        ass.duration_min,
        ass.interview_weight_mcq ?? 40,
        ass.interview_weight_subjective ?? 60,
        snapshottedBy ?? null,
      ],
    );
    const versionId = versionInsert[0].id;

    const { rows: questions } = await client.query<QuestionSnapshot>(
      `SELECT id AS source_question_id, type, topic, difficulty, prompt, options, rubric, correct_answer, position
       FROM assessment_questions WHERE assessment_id = $1 ORDER BY position ASC`,
      [assessmentId],
    );

    for (const q of questions) {
      await client.query(
        `INSERT INTO assessment_version_questions (
           version_id, source_question_id, type, topic, difficulty, prompt, options, rubric, correct_answer, position
         ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10)`,
        [
          versionId,
          q.source_question_id,
          q.type,
          q.topic,
          q.difficulty,
          q.prompt,
          q.options != null ? JSON.stringify(q.options) : null,
          q.rubric,
          q.correct_answer,
          q.position,
        ],
      );
    }

    await client.query("COMMIT");
    return versionId;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/** Build randomized question order for a session attempt. */
export function buildQuestionOrder(questionIds: string[], mcqOptionCounts: Map<string, number>): QuestionOrderSnapshot {
  const option_orders: Record<string, number[]> = {};
  for (const [qid, count] of mcqOptionCounts) {
    if (count > 1) {
      option_orders[qid] = shuffle(Array.from({ length: count }, (_, i) => i));
    }
  }
  return { question_ids: shuffle(questionIds), option_orders };
}

export async function loadVersionQuestions(versionId: string): Promise<
  {
    id: string;
    source_question_id: string | null;
    type: string;
    topic: string | null;
    prompt: string;
    options: string[] | null;
    rubric: string | null;
    correct_answer: string | null;
    position: number;
  }[]
> {
  const pool = getPgPool();
  const { rows } = await pool.query(
    `SELECT id, source_question_id, type, topic, prompt, options, rubric, correct_answer, position
     FROM assessment_version_questions WHERE version_id = $1 ORDER BY position ASC`,
    [versionId],
  );
  return rows.map((r) => ({
    ...r,
    options: normalizeOptions(r.options),
  }));
}

function normalizeOptions(raw: unknown): string[] | null {
  if (raw == null) return null;
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed.map(String) : null;
    } catch {
      return null;
    }
  }
  return null;
}
