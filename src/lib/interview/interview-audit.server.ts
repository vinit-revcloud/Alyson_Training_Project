import { getPgPool } from "@/lib/pg.server";

export interface HrNoteRow {
  id: string;
  session_id: string;
  author_id: string | null;
  author_email: string | null;
  body: string;
  created_at: string;
}

export interface QuestionFlagRow {
  id: string;
  session_id: string;
  question_id: string;
  reason: string;
  flagged_by: string | null;
  created_at: string;
}

export interface SupportingScoreRow {
  id: string;
  session_id: string;
  score_type: "paper_test" | "in_person" | "verbal_interview" | "other";
  label: string;
  score: number | null;
  weight_pct: number | null;
  notes: string | null;
  evidence: unknown;
  created_by: string | null;
  created_at: string;
}

export async function appendHrNote(input: {
  sessionId: string;
  authorId: string;
  authorEmail: string;
  body: string;
}): Promise<HrNoteRow> {
  const pool = getPgPool();
  const { rows } = await pool.query<HrNoteRow>(
    `INSERT INTO interview_hr_notes (session_id, author_id, author_email, body)
     VALUES ($1,$2,$3,$4)
     RETURNING *`,
    [input.sessionId, input.authorId, input.authorEmail, input.body.trim()],
  );
  return rows[0];
}

export async function listHrNotes(sessionId: string): Promise<HrNoteRow[]> {
  const pool = getPgPool();
  const { rows } = await pool.query<HrNoteRow>(
    `SELECT * FROM interview_hr_notes WHERE session_id = $1 ORDER BY created_at ASC`,
    [sessionId],
  );
  return rows;
}

export async function flagInterviewQuestion(input: {
  sessionId: string;
  questionId: string;
  reason: string;
  flaggedBy: string;
}): Promise<QuestionFlagRow> {
  const pool = getPgPool();
  const { rows } = await pool.query<QuestionFlagRow>(
    `INSERT INTO interview_question_flags (session_id, question_id, reason, flagged_by)
     VALUES ($1,$2,$3,$4)
     RETURNING *`,
    [input.sessionId, input.questionId, input.reason.trim(), input.flaggedBy],
  );
  return rows[0];
}

export async function listQuestionFlags(sessionId: string): Promise<QuestionFlagRow[]> {
  const pool = getPgPool();
  const { rows } = await pool.query<QuestionFlagRow>(
    `SELECT * FROM interview_question_flags WHERE session_id = $1 ORDER BY created_at DESC`,
    [sessionId],
  );
  return rows;
}

export async function addSupportingScore(input: {
  sessionId: string;
  scoreType: SupportingScoreRow["score_type"];
  label: string;
  score: number | null;
  weightPct?: number | null;
  notes?: string | null;
  evidence?: unknown;
  createdBy: string;
}): Promise<SupportingScoreRow> {
  const pool = getPgPool();
  const { rows } = await pool.query<SupportingScoreRow>(
    `INSERT INTO interview_supporting_scores (
       session_id, score_type, label, score, weight_pct, notes, evidence, created_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)
     RETURNING *`,
    [
      input.sessionId,
      input.scoreType,
      input.label,
      input.score,
      input.weightPct ?? null,
      input.notes ?? null,
      input.evidence != null ? JSON.stringify(input.evidence) : null,
      input.createdBy,
    ],
  );
  return rows[0];
}

export async function listSupportingScores(sessionId: string): Promise<SupportingScoreRow[]> {
  const pool = getPgPool();
  const { rows } = await pool.query<SupportingScoreRow>(
    `SELECT * FROM interview_supporting_scores WHERE session_id = $1 ORDER BY created_at ASC`,
    [sessionId],
  );
  return rows;
}
