import type { PoolClient } from "pg";
import { getPgPool } from "@/lib/pg.server";
import type { Question } from "@/lib/test-types";
import type {
  AssessmentQuestionRow,
  AssessmentRow,
  AssessmentStatus,
  AssessmentSummaryRow,
  AttemptSummary,
  SaveAssessmentInput,
} from "@/lib/assessments-api";

export async function getClassAssessmentFromDb(classId: string): Promise<AssessmentRow | null> {
  const pool = getPgPool();
  const { rows } = await pool.query<AssessmentRow>(
    `SELECT * FROM assessments
     WHERE class_id = $1 AND is_primary = true
     ORDER BY updated_at DESC
     LIMIT 1`,
    [classId],
  );
  return rows[0] ?? null;
}

export async function getAssessmentFromDb(assessmentId: string): Promise<AssessmentRow | null> {
  const pool = getPgPool();
  const { rows } = await pool.query<AssessmentRow>(
    `SELECT * FROM assessments WHERE id = $1`,
    [assessmentId],
  );
  return rows[0] ?? null;
}

export async function listAssessmentQuestionsFromDb(
  assessmentId: string,
): Promise<AssessmentQuestionRow[]> {
  const pool = getPgPool();
  const { rows } = await pool.query<AssessmentQuestionRow>(
    `SELECT * FROM assessment_questions
     WHERE assessment_id = $1
     ORDER BY position ASC`,
    [assessmentId],
  );
  return rows;
}

async function insertAssessmentQuestions(
  client: PoolClient,
  assessmentId: string,
  questions: Question[],
): Promise<void> {
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const optionsJson =
      q.type === "mcq" && q.options?.length ? JSON.stringify(q.options) : null;
    await client.query(
      `INSERT INTO assessment_questions (
        assessment_id, type, topic, difficulty, prompt, options, correct_answer, rubric, position
      ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)`,
      [
        assessmentId,
        q.type,
        q.topic ?? "",
        q.difficulty ?? "medium",
        q.prompt,
        optionsJson,
        q.type === "mcq" ? (q.correctAnswer ?? null) : null,
        q.type === "subjective" ? (q.rubric ?? null) : null,
        i,
      ],
    );
  }
}

export async function saveClassAssessmentInDb(input: SaveAssessmentInput): Promise<string> {
  const pool = getPgPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const isInterview = input.purpose === "interview";
    let classId = input.classId;
    if (isInterview && !classId) {
      classId = await ensureInterviewClassInDb(client);
    }
    if (!classId) throw new Error("Class is required for this assessment.");

    const existing = isInterview
      ? { rows: [] as AssessmentRow[] }
      : await client.query<AssessmentRow>(
      `SELECT * FROM assessments
       WHERE class_id = $1 AND is_primary = true
       ORDER BY updated_at DESC
       LIMIT 1`,
      [classId],
    );

    const validatedAt =
      input.status === "validated" || input.status === "published"
        ? new Date().toISOString()
        : null;
    const publishedAt = input.status === "published" ? new Date().toISOString() : null;
    const isPrimary = !isInterview;
    const source = isInterview ? "interview" : "randomizer";
    const purpose = input.purpose ?? "training";

    let assessmentId: string;
    if (existing.rows[0]) {
      assessmentId = existing.rows[0].id;
      await client.query(
        `UPDATE assessments SET
          class_id = $2, title = $3, description = $4, role = $5, difficulty = $6,
          level = $7, pass_mark = $8, duration_min = $9, status = $10,
          is_primary = $11, source = $12, purpose = $13,
          validated_at = $14, published_at = $15, updated_at = now()
         WHERE id = $1`,
        [
          assessmentId,
          classId,
          input.title,
          input.description ?? "",
          input.role,
          input.difficulty,
          input.level,
          input.passMark,
          input.durationMin ?? 45,
          input.status,
          isPrimary,
          source,
          purpose,
          validatedAt,
          publishedAt,
        ],
      );
      await client.query(`DELETE FROM assessment_questions WHERE assessment_id = $1`, [
        assessmentId,
      ]);
    } else {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO assessments (
          class_id, title, description, role, difficulty, level, pass_mark, duration_min,
          status, is_primary, source, purpose, validated_at, published_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        RETURNING id`,
        [
          classId,
          input.title,
          input.description ?? "",
          input.role,
          input.difficulty,
          input.level,
          input.passMark,
          input.durationMin ?? 45,
          input.status,
          isPrimary,
          source,
          purpose,
          validatedAt,
          publishedAt,
        ],
      );
      assessmentId = inserted.rows[0].id;
    }

    if (input.questions.length) {
      await insertAssessmentQuestions(client, assessmentId, input.questions);
    }

    await client.query("COMMIT");
    return assessmentId;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

const INTERVIEW_POOL_CLASS_NAME = "__interview_assessments__";

/** Dedicated class bucket so interview assessments can be saved without picking a training class. */
export async function ensureInterviewClassInDb(client: PoolClient): Promise<string> {
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM classes WHERE name = $1 LIMIT 1`,
    [INTERVIEW_POOL_CLASS_NAME],
  );
  if (existing.rows[0]?.id) return existing.rows[0].id;

  let courseId: string | null = null;
  const course = await client.query<{ id: string }>(
    `SELECT id FROM courses ORDER BY created_at ASC LIMIT 1`,
  );
  courseId = course.rows[0]?.id ?? null;
  if (!courseId) {
    const ins = await client.query<{ id: string }>(
      `INSERT INTO courses (title, description, status) VALUES ($1, $2, 'published') RETURNING id`,
      ["Interview Assessments", "System course for external interview tests"],
    );
    courseId = ins.rows[0].id;
  }

  const cls = await client.query<{ id: string }>(
    `INSERT INTO classes (course_id, name, summary, status, position)
     VALUES ($1, $2, $3, 'published', 9999)
     RETURNING id`,
    [courseId, INTERVIEW_POOL_CLASS_NAME, "Pool for interview-purpose assessments"],
  );
  return cls.rows[0].id;
}

export async function publishAssessmentInDb(assessmentId: string): Promise<void> {
  const pool = getPgPool();
  const { rowCount } = await pool.query(
    `UPDATE assessments SET status = 'published', published_at = now(), updated_at = now()
     WHERE id = $1`,
    [assessmentId],
  );
  if (!rowCount) throw new Error("Assessment not found");
}

export async function setAssessmentStatusInDb(
  assessmentId: string,
  status: AssessmentStatus,
): Promise<void> {
  const pool = getPgPool();
  const publishedAt = status === "published" ? new Date().toISOString() : null;
  const validatedAt = status === "validated" ? new Date().toISOString() : null;
  const { rowCount } = await pool.query(
    `UPDATE assessments SET
      status = $2,
      published_at = COALESCE($3, published_at),
      validated_at = COALESCE($4, validated_at),
      updated_at = now()
     WHERE id = $1`,
    [assessmentId, status, publishedAt, validatedAt],
  );
  if (!rowCount) throw new Error("Assessment not found");
}

export async function deleteAssessmentFromDb(assessmentId: string): Promise<void> {
  const pool = getPgPool();
  const { rowCount } = await pool.query(`DELETE FROM assessments WHERE id = $1`, [assessmentId]);
  if (!rowCount) throw new Error("Assessment not found");
}

export async function duplicateAssessmentInDb(assessmentId: string): Promise<string> {
  const src = await getAssessmentFromDb(assessmentId);
  if (!src) throw new Error("Assessment not found");
  const questions = await listAssessmentQuestionsFromDb(assessmentId);

  const pool = getPgPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO assessments (
        class_id, title, description, role, difficulty, level, pass_mark, duration_min,
        status, is_primary, source
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'draft',false,$9)
      RETURNING id`,
      [
        src.class_id,
        `${src.title} (Copy)`,
        src.description,
        src.role,
        src.difficulty,
        src.level,
        src.pass_mark,
        src.duration_min,
        src.source,
      ],
    );
    const newId = inserted.rows[0].id;

    if (questions.length) {
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const optionsJson =
          q.type === "mcq" && q.options?.length ? JSON.stringify(q.options) : null;
        await client.query(
          `INSERT INTO assessment_questions (
            assessment_id, type, topic, difficulty, prompt, options, correct_answer, rubric, position
          ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9)`,
          [
            newId,
            q.type,
            q.topic,
            q.difficulty,
            q.prompt,
            optionsJson,
            q.correct_answer,
            q.rubric,
            i,
          ],
        );
      }
    }

    await client.query("COMMIT");
    return newId;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function listAllAssessmentsWithStatsFromDb(): Promise<AssessmentSummaryRow[]> {
  const pool = getPgPool();
  const assessmentsRes = await pool.query<{
    id: string;
    title: string;
    class_id: string;
    role: string;
    status: AssessmentStatus;
    is_primary: boolean;
    purpose: string;
    updated_at: string;
  }>(
    `SELECT id, title, class_id, role, status, is_primary, purpose, updated_at
     FROM assessments
     ORDER BY updated_at DESC
     LIMIT 500`,
  );
  const assessments = assessmentsRes.rows;
  if (!assessments.length) return [];

  const classIds = [...new Set(assessments.map((a) => a.class_id))];
  const assessmentIds = assessments.map((a) => a.id);

  const [classRowsRes, qRowsRes, asgnRowsRes] = await Promise.all([
    pool.query<{ id: string; name: string; course_id: string | null; status: string }>(
      `SELECT id, name, course_id, status FROM classes WHERE id = ANY($1::uuid[])`,
      [classIds],
    ),
    pool.query<{ assessment_id: string }>(
      `SELECT assessment_id FROM assessment_questions WHERE assessment_id = ANY($1::uuid[])`,
      [assessmentIds],
    ),
    pool.query<{
      assessment_id: string;
      status: string;
      due_at: string;
      last_attempt_id: string | null;
    }>(
      `SELECT assessment_id, status, due_at, last_attempt_id
       FROM assessment_assignments
       WHERE assessment_id = ANY($1::uuid[])`,
      [assessmentIds],
    ),
  ]);

  const courseIds = [
    ...new Set(
      classRowsRes.rows.map((c) => c.course_id).filter((x): x is string => !!x),
    ),
  ];
  const courseTitleById = new Map<string, string>();
  if (courseIds.length) {
    const courseRowsRes = await pool.query<{ id: string; title: string }>(
      `SELECT id, title FROM courses WHERE id = ANY($1::uuid[])`,
      [courseIds],
    );
    for (const c of courseRowsRes.rows) {
      courseTitleById.set(c.id, c.title);
    }
  }

  const classById = new Map<string, { name: string; course_id: string | null; status: string }>();
  for (const c of classRowsRes.rows) {
    classById.set(c.id, { name: c.name, course_id: c.course_id, status: c.status });
  }

  const qCount = new Map<string, number>();
  for (const q of qRowsRes.rows) {
    qCount.set(q.assessment_id, (qCount.get(q.assessment_id) ?? 0) + 1);
  }

  const asgnByAssessment = new Map<
    string,
    Array<{ status: string; due_at: string; last_attempt_id: string | null }>
  >();
  for (const r of asgnRowsRes.rows) {
    const arr = asgnByAssessment.get(r.assessment_id) ?? [];
    arr.push({
      status: r.status,
      due_at: r.due_at,
      last_attempt_id: r.last_attempt_id,
    });
    asgnByAssessment.set(r.assessment_id, arr);
  }

  const attemptIds = [
    ...new Set(
      asgnRowsRes.rows.map((r) => r.last_attempt_id).filter((x): x is string => !!x),
    ),
  ];
  const scoreById = new Map<string, number>();
  if (attemptIds.length) {
    const attemptsRes = await pool.query<{ id: string; score: number | null }>(
      `SELECT id, score FROM assessment_attempts WHERE id = ANY($1::uuid[])`,
      [attemptIds],
    );
    for (const a of attemptsRes.rows) {
      if (typeof a.score === "number") scoreById.set(a.id, a.score);
    }
  }

  const now = Date.now();
  const mapped = assessments.map<AssessmentSummaryRow>((a) => {
    const cls = classById.get(a.class_id);
    const asgn = asgnByAssessment.get(a.id) ?? [];
    const assigned_count = asgn.length;
    let completed_count = 0;
    let overdue_count = 0;
    let at_risk_count = 0;
    let scoreSum = 0;
    let scoreN = 0;
    for (const r of asgn) {
      if (r.status === "passed" || r.status === "failed_capped") completed_count += 1;
      if (
        (r.status === "assigned" || r.status === "in_progress") &&
        new Date(r.due_at).getTime() < now
      ) {
        overdue_count += 1;
      }
      if (r.status === "failed_capped" || r.status === "expired") at_risk_count += 1;
      const s = r.last_attempt_id ? scoreById.get(r.last_attempt_id) : undefined;
      if (typeof s === "number") {
        scoreSum += s;
        scoreN += 1;
        if (s < 60) at_risk_count += 1;
      }
    }
    const completion = assigned_count
      ? Math.round((completed_count / assigned_count) * 100)
      : 0;
    return {
      id: a.id,
      title: a.title,
      class_id: a.class_id,
      class_name: cls?.name ?? null,
      course_id: cls?.course_id ?? null,
      course_title: cls?.course_id ? (courseTitleById.get(cls.course_id) ?? null) : null,
      role: a.role,
      status: a.status,
      type: a.is_primary ? "Final" : "Practice",
      is_primary: a.is_primary,
      purpose: a.purpose === "interview" ? "interview" : "training",
      question_count: qCount.get(a.id) ?? 0,
      assigned_count,
      completed_count,
      overdue_count,
      at_risk_count,
      completion,
      avg_score: scoreN ? Math.round(scoreSum / scoreN) : null,
      updated_at:
        a.updated_at instanceof Date
          ? a.updated_at.toISOString()
          : String(a.updated_at ?? ""),
      class_status: cls?.status ?? null,
    };
  });

  return mapped;
}

export async function getAssessmentAttemptSummaryFromDb(
  assessmentId: string,
): Promise<AttemptSummary> {
  const pool = getPgPool();
  const { rows } = await pool.query<{
    status: string;
    score: number | null;
    passed: boolean | null;
    updated_at: string;
  }>(
    `SELECT status, score, passed, updated_at FROM assessment_attempts WHERE assessment_id = $1`,
    [assessmentId],
  );

  const summary: AttemptSummary = {
    total: rows.length,
    not_started: 0,
    in_progress: 0,
    submitted: 0,
    graded: 0,
    passed: 0,
    failed: 0,
    avgScore: null,
    lastActivity: null,
  };
  let scoreSum = 0;
  let scoreCount = 0;
  for (const r of rows) {
    const s = r.status ?? "in_progress";
    if (s === "in_progress") summary.in_progress += 1;
    else if (s === "submitted") summary.submitted += 1;
    else if (s === "graded") summary.graded += 1;
    else summary.not_started += 1;
    if (r.passed === true) summary.passed += 1;
    if (r.passed === false && s === "graded") summary.failed += 1;
    if (typeof r.score === "number") {
      scoreSum += r.score;
      scoreCount += 1;
    }
    if (!summary.lastActivity || r.updated_at > summary.lastActivity) {
      summary.lastActivity = r.updated_at;
    }
  }
  summary.avgScore = scoreCount ? Math.round(scoreSum / scoreCount) : null;
  return summary;
}
