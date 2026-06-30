import { getPgPool } from "@/lib/pg.server";
import type {
  AssessmentMode,
  InterviewSessionListItem,
  InterviewSessionRow,
  PublicInterviewState,
} from "./interview.shared";
import { generateInterviewToken, hashInterviewToken } from "./interview-token.server";
import type { LearnerQuestion } from "@/lib/attempt.functions";
import { normalizeSessionRow } from "./interview-parse.server";
import {
  buildQuestionOrder,
  canonicalQuestionId,
  loadVersionQuestions,
  snapshotAssessmentVersion,
  type QuestionOrderSnapshot,
} from "./assessment-version.server";
import {
  INTERVIEW_LIST_DEFAULT_LIMIT,
  INTERVIEW_LIST_MAX_LIMIT,
} from "./interview.shared";

export { INTERVIEW_LIST_DEFAULT_LIMIT, INTERVIEW_LIST_MAX_LIMIT };

export interface InterviewSubmissionAnswer {
  question_id: string;
  type: "mcq" | "subjective";
  prompt: string;
  topic: string;
  position: number;
  answer: string;
  is_correct: boolean | null;
  score: number | null;
  correct_answer: string | null;
}

export interface CreateInterviewInput {
  assessmentId: string;
  candidateName: string;
  candidateEmail: string;
  role: string;
  level: string;
  scheduledAt: string;
  expiresAt: string;
  createdBy: string;
  assessmentMode?: AssessmentMode;
}

export async function createInterviewSessionInDb(
  input: CreateInterviewInput,
): Promise<{ session: InterviewSessionRow; rawToken: string }> {
  const pool = getPgPool();
  const rawToken = generateInterviewToken();
  const tokenHash = hashInterviewToken(rawToken);
  const email = input.candidateEmail.trim().toLowerCase();
  const versionId = await snapshotAssessmentVersion(input.assessmentId, input.createdBy);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const cand = await client.query<{ id: string }>(
      `INSERT INTO candidates (user_id, name, email)
       VALUES (NULL, $1, $2)
       RETURNING id`,
      [input.candidateName.trim(), email],
    );
    const candidateId = cand.rows[0].id;

    const assessmentMode = input.assessmentMode ?? "online";

    const sess = await client.query<InterviewSessionRow>(
      `INSERT INTO interview_sessions (
         assessment_id, assessment_version_id, assessment_mode, candidate_id, candidate_name, candidate_email,
         role, level, scheduled_at, expires_at, access_token_hash, created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        input.assessmentId,
        versionId,
        assessmentMode,
        candidateId,
        input.candidateName.trim(),
        email,
        input.role,
        input.level,
        input.scheduledAt,
        input.expiresAt,
        tokenHash,
        input.createdBy,
      ],
    );

    await client.query("COMMIT");
    return { session: sess.rows[0], rawToken };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function listInterviewSessionsFromDb(opts?: {
  limit?: number;
  offset?: number;
}): Promise<{ sessions: InterviewSessionListItem[]; total: number }> {
  const limit = Math.min(
    Math.max(opts?.limit ?? INTERVIEW_LIST_DEFAULT_LIMIT, 1),
    INTERVIEW_LIST_MAX_LIMIT,
  );
  const offset = Math.max(opts?.offset ?? 0, 0);
  const pool = getPgPool();
  const [countRes, listRes] = await Promise.all([
    pool.query<{ n: string }>(`SELECT count(*)::text AS n FROM interview_sessions`),
    pool.query<InterviewSessionListItem>(
      `SELECT s.*, a.title AS assessment_title
       FROM interview_sessions s
       JOIN assessments a ON a.id = s.assessment_id
       ORDER BY s.scheduled_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    ),
  ]);
  return {
    sessions: listRes.rows.map((row) => normalizeSessionRow(row)),
    total: parseInt(countRes.rows[0]?.n ?? "0", 10),
  };
}

export async function getInterviewSessionByIdFromDb(
  sessionId: string,
): Promise<InterviewSessionListItem | null> {
  const pool = getPgPool();
  const { rows } = await pool.query<
    InterviewSessionListItem & {
      question_count: string;
      assessment_version_id: string | null;
    }
  >(
    `SELECT s.*, a.title AS assessment_title, s.assessment_version_id,
            CASE
              WHEN s.assessment_version_id IS NOT NULL THEN (
                SELECT count(*)::text FROM assessment_version_questions vq
                WHERE vq.version_id = s.assessment_version_id
              )
              ELSE (
                SELECT count(*)::text FROM assessment_questions q WHERE q.assessment_id = s.assessment_id
              )
            END AS question_count
     FROM interview_sessions s
     JOIN assessments a ON a.id = s.assessment_id
     WHERE s.id = $1`,
    [sessionId],
  );
  const row = rows[0];
  if (!row) return null;
  return normalizeSessionRow({
    ...row,
    question_count: parseInt(row.question_count ?? "0", 10),
  });
}

export async function getInterviewSubmissionRecordFromDb(
  sessionId: string,
): Promise<InterviewSubmissionAnswer[]> {
  const pool = getPgPool();
  const { rows: sessions } = await pool.query<{
    attempt_id: string | null;
    assessment_version_id: string | null;
    assessment_id: string;
    question_order: QuestionOrderSnapshot | null;
  }>(
    `SELECT attempt_id, assessment_version_id, assessment_id, question_order
     FROM interview_sessions WHERE id = $1`,
    [sessionId],
  );
  const sess = sessions[0];
  if (!sess?.attempt_id) return [];

  type QRow = {
    question_id: string;
    type: string;
    prompt: string;
    topic: string;
    position: number;
    correct_answer: string | null;
  };

  let questions: QRow[] = [];
  if (sess.assessment_version_id) {
    const versionQs = await loadVersionQuestions(sess.assessment_version_id);
    questions = versionQs.map((q, i) => ({
      question_id: canonicalQuestionId(q),
      type: q.type,
      prompt: q.prompt,
      topic: q.topic ?? "",
      position: q.position ?? i,
      correct_answer: q.correct_answer,
    }));
  } else {
    const { rows } = await pool.query<QRow>(
      `SELECT id AS question_id, type, prompt, topic, position, correct_answer
       FROM assessment_questions WHERE assessment_id = $1 ORDER BY position ASC`,
      [sess.assessment_id],
    );
    questions = rows;
  }

  const order = sess.question_order?.question_ids;
  if (order?.length) {
    const byId = new Map(questions.map((q) => [q.question_id, q]));
    questions = order
      .map((id, i) => {
        const q = byId.get(id);
        return q ? { ...q, position: i } : null;
      })
      .filter((q): q is QRow => q != null);
  }

  const { rows: answers } = await pool.query<{
    question_id: string;
    answer: string | null;
    is_correct: boolean | null;
    score: string | null;
  }>(
    `SELECT question_id, answer, is_correct, score FROM attempt_answers WHERE attempt_id = $1`,
    [sess.attempt_id],
  );
  const answerMap = new Map(answers.map((a) => [a.question_id, a]));

  return questions.map((q) => {
    const aa = answerMap.get(q.question_id);
    return {
      question_id: q.question_id,
      type: q.type as "mcq" | "subjective",
      prompt: q.prompt,
      topic: q.topic,
      position: q.position,
      answer: aa?.answer ?? "",
      is_correct: aa?.is_correct ?? null,
      score: aa?.score != null ? Number(aa.score) : null,
      correct_answer: q.correct_answer,
    };
  });
}

export async function validateInterviewAssessmentForSchedule(assessmentId: string): Promise<{
  title: string;
  questionCount: number;
}> {
  const pool = getPgPool();
  const { rows } = await pool.query<{
    title: string;
    purpose: string;
    status: string;
    question_count: string;
  }>(
    `SELECT a.title, a.purpose, a.status,
            (SELECT count(*)::text FROM assessment_questions q WHERE q.assessment_id = a.id) AS question_count
     FROM assessments a WHERE a.id = $1`,
    [assessmentId],
  );
  const row = rows[0];
  if (!row) throw new Error("Assessment not found.");
  if (row.purpose !== "interview") {
    throw new Error("Only assessments with purpose \"interview\" can be scheduled.");
  }
  if (!["validated", "published"].includes(row.status)) {
    throw new Error("Assessment must be validated or published before scheduling.");
  }
  const questionCount = parseInt(row.question_count ?? "0", 10);
  if (questionCount === 0) {
    throw new Error("Assessment has no questions — save questions in the builder first.");
  }
  return { title: row.title, questionCount };
}

export async function openInterviewSessionInDb(
  sessionId: string,
  openedBy: string,
): Promise<InterviewSessionRow> {
  const pool = getPgPool();
  const { rows } = await pool.query<InterviewSessionRow>(
    `UPDATE interview_sessions
     SET status = 'opened', opened_at = now(), opened_by = $2, updated_at = now()
     WHERE id = $1 AND status IN ('waiting', 'opened')
     RETURNING *`,
    [sessionId, openedBy],
  );
  if (!rows[0]) {
    throw new Error(
      "Cannot open this session — candidate must confirm identity first (waiting room).",
    );
  }
  return normalizeSessionRow(rows[0]);
}

export async function confirmInterviewIdentityInDb(
  sessionId: string,
  name: string,
  email: string,
): Promise<InterviewSessionRow> {
  const pool = getPgPool();
  const { rows: existing } = await pool.query<InterviewSessionRow>(
    `SELECT * FROM interview_sessions WHERE id = $1`,
    [sessionId],
  );
  const session = existing[0];
  if (!session) throw new Error("Interview session not found.");
  if (session.status === "cancelled" || session.status === "expired") {
    throw new Error("This interview link is no longer valid.");
  }

  const nameOk = name.trim().toLowerCase() === session.candidate_name.trim().toLowerCase();
  const emailOk = email.trim().toLowerCase() === session.candidate_email.trim().toLowerCase();
  if (!nameOk || !emailOk) {
    throw new Error("Name or email does not match our records. Contact HR if this is incorrect.");
  }

  if (session.status === "scheduled") {
    const { rows } = await pool.query<InterviewSessionRow>(
      `UPDATE interview_sessions SET status = 'waiting', updated_at = now()
       WHERE id = $1 RETURNING *`,
      [sessionId],
    );
    return rows[0];
  }
  return session;
}

export async function getPublicInterviewState(session: InterviewSessionRow): Promise<PublicInterviewState> {
  const pool = getPgPool();
  const versionId = (
    session as InterviewSessionRow & { assessment_version_id?: string | null }
  ).assessment_version_id;

  let title = "Interview assessment";
  let duration_min = 45;
  let question_count = 0;

  if (versionId) {
    const { rows } = await pool.query<{
      title: string;
      duration_min: number | null;
      question_count: string;
    }>(
      `SELECT av.title, av.duration_min,
              (SELECT count(*)::text FROM assessment_version_questions vq WHERE vq.version_id = av.id) AS question_count
       FROM assessment_versions av WHERE av.id = $1`,
      [versionId],
    );
    const v = rows[0];
    if (v) {
      title = v.title;
      duration_min = v.duration_min ?? 45;
      question_count = parseInt(v.question_count ?? "0", 10);
    }
  } else {
    const { rows } = await pool.query<{
      title: string;
      duration_min: number | null;
      question_count: string;
    }>(
      `SELECT a.title, a.duration_min,
              (SELECT count(*)::text FROM assessment_questions q WHERE q.assessment_id = a.id) AS question_count
       FROM assessments a WHERE a.id = $1`,
      [session.assessment_id],
    );
    const a = rows[0];
    if (a) {
      title = a.title;
      duration_min = a.duration_min ?? 45;
      question_count = parseInt(a.question_count ?? "0", 10);
    }
  }

  let attempt_started_at: string | null = null;
  if (session.attempt_id) {
    const { rows: attRows } = await pool.query<{ started_at: Date | null }>(
      `SELECT started_at FROM assessment_attempts WHERE id = $1`,
      [session.attempt_id],
    );
    const started = attRows[0]?.started_at;
    if (started) {
      attempt_started_at =
        started instanceof Date ? started.toISOString() : String(started);
    }
  }

  const toIso = (v: unknown) =>
    v instanceof Date ? v.toISOString() : v != null ? String(v) : "";
  return {
    status: session.status,
    candidate_name: session.candidate_name,
    scheduled_at: toIso(session.scheduled_at),
    expires_at: toIso(session.expires_at),
    assessment_title: title,
    duration_min,
    question_count,
    role: session.role,
    level: session.level,
    attempt_started_at,
  };
}

export async function startInterviewAttemptInDb(session: InterviewSessionRow): Promise<string> {
  if (session.attempt_id) return session.attempt_id;

  const pool = getPgPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const att = await client.query<{ id: string }>(
      `INSERT INTO assessment_attempts (assessment_id, candidate_id, attempt_number, status)
       VALUES ($1, $2, 1, 'in_progress')
       RETURNING id`,
      [session.assessment_id, session.candidate_id],
    );
    const attemptId = att.rows[0].id;

    let questionOrder: QuestionOrderSnapshot | null = null;
    const versionId = (session as InterviewSessionRow & { assessment_version_id?: string | null })
      .assessment_version_id;
    if (versionId) {
      const versionQs = await loadVersionQuestions(versionId);
      const mcqCounts = new Map<string, number>();
      for (const q of versionQs) {
        const qid = canonicalQuestionId(q);
        if (q.type === "mcq" && q.options?.length) {
          mcqCounts.set(qid, q.options.length);
        }
      }
      questionOrder = buildQuestionOrder(
        versionQs.map((q) => canonicalQuestionId(q)),
        mcqCounts,
      );
    } else {
      const { rows: liveQs } = await client.query<{ id: string; type: string; options: unknown }>(
        `SELECT id, type, options FROM assessment_questions WHERE assessment_id = $1`,
        [session.assessment_id],
      );
      const mcqCounts = new Map<string, number>();
      for (const q of liveQs) {
        const opts = normalizeOptions(q.options);
        if (q.type === "mcq" && opts?.length) mcqCounts.set(q.id, opts.length);
      }
      questionOrder = buildQuestionOrder(
        liveQs.map((q) => q.id),
        mcqCounts,
      );
    }

    await client.query(
      `UPDATE interview_sessions
       SET status = 'in_progress', attempt_id = $2, question_order = $3::jsonb, updated_at = now()
       WHERE id = $1`,
      [session.id, attemptId, JSON.stringify(questionOrder)],
    );

    await client.query("COMMIT");
    return attemptId;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function getInterviewQuestionsFromDb(
  sessionId: string,
): Promise<LearnerQuestion[]> {
  const pool = getPgPool();
  const { rows: sessRows } = await pool.query<{
    assessment_id: string;
    assessment_version_id: string | null;
    question_order: QuestionOrderSnapshot | null;
  }>(
    `SELECT assessment_id, assessment_version_id, question_order FROM interview_sessions WHERE id = $1`,
    [sessionId],
  );
  const sess = sessRows[0];
  if (!sess) return [];

  type QRow = {
    id: string;
    type: string;
    topic: string;
    difficulty: string;
    prompt: string;
    options: unknown;
    position: number;
  };

  let rows: QRow[] = [];
  if (sess.assessment_version_id) {
    const versionQs = await loadVersionQuestions(sess.assessment_version_id);
    rows = versionQs.map((q, i) => ({
      id: canonicalQuestionId(q),
      type: q.type,
      topic: q.topic ?? "",
      difficulty: q.difficulty ?? "medium",
      prompt: q.prompt,
      options: q.options,
      position: q.position ?? i,
    }));
  } else {
    const { rows: live } = await pool.query<QRow>(
      `SELECT id, type, topic, difficulty, prompt, options, position
       FROM assessment_questions WHERE assessment_id = $1 ORDER BY position ASC`,
      [sess.assessment_id],
    );
    rows = live;
  }

  const order = sess.question_order?.question_ids;
  if (order?.length) {
    const byId = new Map(rows.map((r) => [r.id, r]));
    if (sess.assessment_version_id) {
      const versionQs = await loadVersionQuestions(sess.assessment_version_id);
      for (const vq of versionQs) {
        const canonical = canonicalQuestionId(vq);
        const row = byId.get(canonical);
        if (row) byId.set(vq.id, row);
      }
    }
    rows = order
      .map((id, i) => {
        const r = byId.get(id);
        return r ? { ...r, position: i } : null;
      })
      .filter((r): r is QRow => r != null);
  }

  const optionOrders = sess.question_order?.option_orders ?? {};

  return rows.map((r, i) => {
    let options = normalizeOptions(r.options);
    const perm = optionOrders[r.id];
    if (options && perm?.length === options.length) {
      options = perm.map((idx) => options![idx]);
    }
    return {
      id: r.id,
      type: r.type as "mcq" | "subjective",
      topic: r.topic ?? "",
      difficulty: (r.difficulty ?? "medium") as "easy" | "medium" | "hard",
      prompt: r.prompt,
      options,
      position: i,
    };
  });
}

export async function getGradingQuestionsForSession(
  sessionId: string,
): Promise<{ id: string; type: string; correct_answer: string | null; options: string[] | null }[]> {
  const pool = getPgPool();
  const { rows: sessRows } = await pool.query<{
    assessment_id: string;
    assessment_version_id: string | null;
  }>(
    `SELECT assessment_id, assessment_version_id FROM interview_sessions WHERE id = $1`,
    [sessionId],
  );
  const sess = sessRows[0];
  if (!sess) return [];

  if (sess.assessment_version_id) {
    const versionQs = await loadVersionQuestions(sess.assessment_version_id);
    return versionQs.map((q) => ({
      id: canonicalQuestionId(q),
      type: q.type,
      correct_answer: q.correct_answer,
      options: q.options,
    }));
  }

  const { rows } = await pool.query<{
    id: string;
    type: string;
    correct_answer: string | null;
    options: unknown;
  }>(
    `SELECT id, type, correct_answer, options FROM assessment_questions WHERE assessment_id = $1`,
    [sess.assessment_id],
  );
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    correct_answer: r.correct_answer,
    options: normalizeOptions(r.options),
  }));
}

export async function refreshSessionAssessmentVersionInDb(
  sessionId: string,
  updatedBy: string,
): Promise<void> {
  const pool = getPgPool();
  const { rows } = await pool.query<{ assessment_id: string; status: string }>(
    `SELECT assessment_id, status FROM interview_sessions WHERE id = $1`,
    [sessionId],
  );
  const row = rows[0];
  if (!row) throw new Error("Session not found.");
  if (!["scheduled", "waiting", "opened"].includes(row.status)) {
    throw new Error("Can only refresh assessment version before the test starts.");
  }
  const versionId = await snapshotAssessmentVersion(row.assessment_id, updatedBy);
  await pool.query(
    `UPDATE interview_sessions
     SET assessment_version_id = $2, question_order = NULL, updated_at = now()
     WHERE id = $1`,
    [sessionId, versionId],
  );
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

export interface AssessmentRubricItem {
  position: number;
  type: string;
  prompt: string;
  rubric: string | null;
  correct_answer: string | null;
}

/** Question blueprint for paper vision grading (snapshotted version when available). */
export async function getAssessmentRubricContextForSession(
  sessionId: string,
): Promise<AssessmentRubricItem[]> {
  const pool = getPgPool();
  const { rows: sessRows } = await pool.query<{
    assessment_id: string;
    assessment_version_id: string | null;
  }>(
    `SELECT assessment_id, assessment_version_id FROM interview_sessions WHERE id = $1`,
    [sessionId],
  );
  const sess = sessRows[0];
  if (!sess) return [];

  if (sess.assessment_version_id) {
    const versionQs = await loadVersionQuestions(sess.assessment_version_id);
    return versionQs.map((q, i) => ({
      position: q.position ?? i + 1,
      type: q.type,
      prompt: q.prompt,
      rubric: q.rubric,
      correct_answer: q.correct_answer,
    }));
  }

  const { rows } = await pool.query<AssessmentRubricItem>(
    `SELECT position, type, prompt, rubric, correct_answer
     FROM assessment_questions WHERE assessment_id = $1 ORDER BY position ASC`,
    [sess.assessment_id],
  );
  return rows;
}

/** Map version-question UUIDs to assessment_questions ids for attempt_answers FK. */
export async function normalizeInterviewAnswerKeys(
  sessionId: string,
  answers: Record<string, string>,
): Promise<Record<string, string>> {
  const pool = getPgPool();
  const { rows } = await pool.query<{ assessment_version_id: string | null }>(
    `SELECT assessment_version_id FROM interview_sessions WHERE id = $1`,
    [sessionId],
  );
  const versionId = rows[0]?.assessment_version_id;
  if (!versionId) return answers;

  const versionQs = await loadVersionQuestions(versionId);
  const alias = new Map<string, string>();
  for (const q of versionQs) {
    const canonical = canonicalQuestionId(q);
    alias.set(q.id, canonical);
    alias.set(canonical, canonical);
  }

  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(answers)) {
    out[alias.get(key) ?? key] = value;
  }
  return out;
}

export async function saveInterviewDraftAnswersInDb(
  attemptId: string,
  answers: Record<string, string>,
): Promise<void> {
  const pool = getPgPool();
  for (const [questionId, answer] of Object.entries(answers)) {
    const upd = await pool.query(
      `UPDATE attempt_answers SET answer = $3 WHERE attempt_id = $1 AND question_id = $2`,
      [attemptId, questionId, answer],
    );
    if (!upd.rowCount) {
      await pool.query(
        `INSERT INTO attempt_answers (attempt_id, question_id, answer) VALUES ($1, $2, $3)`,
        [attemptId, questionId, answer],
      );
    }
  }
}

export async function loadInterviewDraftAnswersFromDb(
  attemptId: string,
): Promise<Record<string, string>> {
  const pool = getPgPool();
  const { rows } = await pool.query<{ question_id: string; answer: string }>(
    `SELECT question_id, answer FROM attempt_answers WHERE attempt_id = $1`,
    [attemptId],
  );
  const out: Record<string, string> = {};
  for (const r of rows) out[r.question_id] = r.answer ?? "";
  return out;
}

/** version-question id → assessment_questions id (for remapping legacy client drafts). */
export async function buildInterviewAnswerKeyAliases(
  sessionId: string,
): Promise<Record<string, string>> {
  const pool = getPgPool();
  const { rows } = await pool.query<{ assessment_version_id: string | null }>(
    `SELECT assessment_version_id FROM interview_sessions WHERE id = $1`,
    [sessionId],
  );
  const versionId = rows[0]?.assessment_version_id;
  if (!versionId) return {};

  const versionQs = await loadVersionQuestions(versionId);
  const aliases: Record<string, string> = {};
  for (const q of versionQs) {
    const canonical = canonicalQuestionId(q);
    if (q.id !== canonical) aliases[q.id] = canonical;
  }
  return aliases;
}

/** Align persisted draft rows to the question ids shown in the candidate UI. */
export async function alignSavedAnswersForSession(
  sessionId: string,
  savedAnswers: Record<string, string>,
): Promise<Record<string, string>> {
  const questions = await getInterviewQuestionsFromDb(sessionId);
  const normalized = await normalizeInterviewAnswerKeys(sessionId, savedAnswers);
  const aligned: Record<string, string> = {};
  for (const q of questions) {
    const val = normalized[q.id];
    if (val != null && val.trim()) aligned[q.id] = val;
  }
  return aligned;
}

export async function appendInterviewEvent(
  sessionId: string,
  event: { type: string; at: string; detail?: string },
): Promise<void> {
  const pool = getPgPool();
  await pool.query(
    `UPDATE interview_sessions
     SET interview_events = interview_events || $2::jsonb, updated_at = now()
     WHERE id = $1`,
    [sessionId, JSON.stringify([event])],
  );
}

export async function updateProctorNotesInDb(
  sessionId: string,
  notes: string,
): Promise<void> {
  const pool = getPgPool();
  await pool.query(
    `UPDATE interview_sessions SET proctor_notes = $2, updated_at = now() WHERE id = $1`,
    [sessionId, notes],
  );
}

export async function regenerateInterviewTokenInDb(sessionId: string): Promise<string> {
  const rawToken = generateInterviewToken();
  const tokenHash = hashInterviewToken(rawToken);
  const pool = getPgPool();
  const { rowCount } = await pool.query(
    `UPDATE interview_sessions SET access_token_hash = $2, updated_at = now()
     WHERE id = $1 AND status NOT IN ('cancelled', 'expired')`,
    [sessionId, tokenHash],
  );
  if (!rowCount) throw new Error("Cannot regenerate link for this session.");
  return rawToken;
}

export async function getInterviewQuestionCount(assessmentId: string): Promise<number> {
  const pool = getPgPool();
  const { rows } = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM assessment_questions WHERE assessment_id = $1`,
    [assessmentId],
  );
  return parseInt(rows[0]?.count ?? "0", 10);
}

export async function listInterviewAssessmentsFromDb() {
  const pool = getPgPool();
  const { rows } = await pool.query<{ id: string; title: string; status: string }>(
    `SELECT id, title, status FROM assessments
     WHERE purpose = 'interview' AND status IN ('validated', 'published')
     ORDER BY updated_at DESC`,
  );
  return rows;
}

export async function cancelInterviewSessionInDb(sessionId: string): Promise<void> {
  const pool = getPgPool();
  const { rowCount } = await pool.query(
    `UPDATE interview_sessions SET status = 'cancelled', updated_at = now()
     WHERE id = $1 AND status NOT IN ('submitted','evaluating','evaluated')`,
    [sessionId],
  );
  if (!rowCount) throw new Error("Cannot cancel this session.");
}

/** Permanently remove a session, linked attempt, and orphan candidate row. */
export async function deleteInterviewSessionInDb(sessionId: string): Promise<void> {
  const pool = getPgPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ attempt_id: string | null; candidate_id: string }>(
      `SELECT attempt_id, candidate_id FROM interview_sessions WHERE id = $1 FOR UPDATE`,
      [sessionId],
    );
    const row = rows[0];
    if (!row) throw new Error("Interview session not found.");

    const { rowCount } = await client.query(`DELETE FROM interview_sessions WHERE id = $1`, [
      sessionId,
    ]);
    if (!rowCount) throw new Error("Interview session not found.");

    if (row.attempt_id) {
      await client.query(`DELETE FROM assessment_attempts WHERE id = $1`, [row.attempt_id]);
    }

    await client.query(
      `DELETE FROM candidates c
       WHERE c.id = $1
         AND NOT EXISTS (SELECT 1 FROM interview_sessions s WHERE s.candidate_id = c.id)`,
      [row.candidate_id],
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** @deprecated AI scores are immutable — use appendHrNoteInDb / addSupportingScore instead. */
export async function saveHrOverrideInDb(
  sessionId: string,
  _score: number | null,
  notes: string | null,
): Promise<void> {
  if (notes?.trim()) {
    await poolAppendProctorNotes(sessionId, notes);
  }
}

async function poolAppendProctorNotes(sessionId: string, notes: string): Promise<void> {
  const pool = getPgPool();
  await pool.query(
    `UPDATE interview_sessions SET proctor_notes = $2, updated_at = now() WHERE id = $1`,
    [sessionId, notes],
  );
}

export async function updateInPersonFlowInDb(
  sessionId: string,
  flow: import("./interview.shared").InPersonFlow,
): Promise<void> {
  const pool = getPgPool();
  await pool.query(
    `UPDATE interview_sessions SET in_person_flow = $2::jsonb, updated_at = now() WHERE id = $1`,
    [sessionId, JSON.stringify(flow)],
  );
}

export async function addPaperUploadInDb(
  sessionId: string,
  upload: import("./interview.shared").PaperUpload,
): Promise<import("./interview.shared").PaperAssessment> {
  const pool = getPgPool();
  const { rows } = await pool.query<{ paper_assessment: unknown }>(
    `SELECT paper_assessment FROM interview_sessions WHERE id = $1`,
    [sessionId],
  );
  const { parsePaperAssessment } = await import("./interview.shared");
  const current = parsePaperAssessment(rows[0]?.paper_assessment) ?? { uploads: [], status: "pending" as const };
  const next = {
    ...current,
    uploads: [...current.uploads, upload],
    status: "pending" as const,
  };
  await pool.query(
    `UPDATE interview_sessions SET paper_assessment = $2::jsonb, updated_at = now() WHERE id = $1`,
    [sessionId, JSON.stringify(next)],
  );
  return next;
}

export async function removePaperUploadInDb(sessionId: string, uploadId: string): Promise<void> {
  const pool = getPgPool();
  const { rows } = await pool.query<{ paper_assessment: unknown }>(
    `SELECT paper_assessment FROM interview_sessions WHERE id = $1`,
    [sessionId],
  );
  const { parsePaperAssessment } = await import("./interview.shared");
  const current = parsePaperAssessment(rows[0]?.paper_assessment);
  if (!current) return;
  const next = {
    ...current,
    uploads: current.uploads.filter((u) => u.id !== uploadId),
  };
  await pool.query(
    `UPDATE interview_sessions SET paper_assessment = $2::jsonb, updated_at = now() WHERE id = $1`,
    [sessionId, JSON.stringify(next)],
  );
}
