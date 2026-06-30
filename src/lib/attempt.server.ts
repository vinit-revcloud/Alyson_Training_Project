import type { PoolClient } from "pg";
import { getPgPool } from "@/lib/pg.server";
import { mcqAnswersMatch } from "@/lib/mcq-match.server";
import type {
  ActiveAttemptState,
  LearnerAssessmentMeta,
  LearnerAssignmentRow,
  LearnerQuestion,
} from "@/lib/attempt.shared";

function parseOptions(raw: unknown): string[] | null {
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

async function loadAssignmentForLearner(
  client: PoolClient,
  assignmentId: string,
  userId: string,
): Promise<LearnerAssignmentRow | null> {
  const { rows } = await client.query<LearnerAssignmentRow>(
    `SELECT *
     FROM assessment_assignments
     WHERE id = $1 AND learner_user_id = $2`,
    [assignmentId, userId],
  );
  return rows[0] ?? null;
}

export async function getLearnerAssignmentFromDb(
  assignmentId: string,
  userId: string,
): Promise<LearnerAssignmentRow | null> {
  const pool = getPgPool();
  const client = await pool.connect();
  try {
    return await loadAssignmentForLearner(client, assignmentId, userId);
  } finally {
    client.release();
  }
}

export async function getLearnerAssessmentMetadataFromDb(
  assignmentId: string,
  userId: string,
): Promise<LearnerAssessmentMeta | null> {
  const pool = getPgPool();
  const { rows } = await pool.query<LearnerAssessmentMeta>(
    `SELECT a.id, a.title, a.pass_mark, a.duration_min, a.description
     FROM assessments a
     JOIN assessment_assignments aa ON aa.assessment_id = a.id
     WHERE aa.id = $1 AND aa.learner_user_id = $2`,
    [assignmentId, userId],
  );
  return rows[0] ?? null;
}

export async function getAttemptQuestionsFromDb(
  assignmentId: string,
  userId: string,
): Promise<LearnerQuestion[]> {
  const pool = getPgPool();
  const { rows } = await pool.query<{
    id: string;
    type: string;
    topic: string | null;
    difficulty: string | null;
    prompt: string;
    options: unknown;
    position: number | null;
  }>(
    `SELECT q.id, q.type, q.topic, q.difficulty, q.prompt, q.options, q.position
     FROM assessment_questions q
     JOIN assessment_assignments aa ON aa.assessment_id = q.assessment_id
     WHERE aa.id = $1 AND aa.learner_user_id = $2
     ORDER BY q.position ASC NULLS LAST, q.created_at ASC`,
    [assignmentId, userId],
  );

  return rows.map((r) => ({
    id: r.id,
    type: r.type as "mcq" | "subjective",
    topic: r.topic ?? "",
    difficulty: (r.difficulty ?? "medium") as "easy" | "medium" | "hard",
    prompt: r.prompt,
    options: parseOptions(r.options),
    position: r.position ?? 0,
  }));
}

export async function getActiveAttemptFromDb(
  assignmentId: string,
  userId: string,
): Promise<ActiveAttemptState | null> {
  const pool = getPgPool();
  const { rows: attemptRows } = await pool.query<{ id: string }>(
    `SELECT att.id
     FROM assessment_attempts att
     JOIN candidates c ON c.id = att.candidate_id
     JOIN assessment_assignments aa ON aa.assessment_id = att.assessment_id
     WHERE aa.id = $1
       AND c.user_id = $2
       AND att.status = 'in_progress'
     ORDER BY att.started_at DESC
     LIMIT 1`,
    [assignmentId, userId],
  );
  const attemptId = attemptRows[0]?.id;
  if (!attemptId) return null;

  const { rows: answerRows } = await pool.query<{ question_id: string; answer: string }>(
    `SELECT question_id, answer FROM attempt_answers WHERE attempt_id = $1`,
    [attemptId],
  );

  const answers: Record<string, string> = {};
  for (const row of answerRows) {
    answers[row.question_id] = row.answer;
  }

  return { attemptId, answers };
}

async function ensureCandidateId(client: PoolClient, userId: string): Promise<string> {
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM candidates WHERE user_id = $1`,
    [userId],
  );
  if (existing.rows[0]?.id) return existing.rows[0].id;

  const prof = await client.query<{ display_name: string | null; email: string | null }>(
    `SELECT display_name, email FROM profiles WHERE user_id = $1`,
    [userId],
  );
  const created = await client.query<{ id: string }>(
    `INSERT INTO candidates (user_id, name, email)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [
      userId,
      prof.rows[0]?.display_name ?? "Learner",
      prof.rows[0]?.email ?? null,
    ],
  );
  return created.rows[0]!.id;
}

export async function startAttemptInDb(assignmentId: string, userId: string): Promise<string> {
  const pool = getPgPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const assignment = await loadAssignmentForLearner(client, assignmentId, userId);
    if (!assignment) throw new Error("Assignment not found");
    if (new Date(assignment.due_at).getTime() <= Date.now()) {
      throw new Error("This assignment has expired.");
    }
    if (assignment.status === "passed" || assignment.status === "failed_capped") {
      throw new Error("This assignment is already complete.");
    }
    if (assignment.attempts_used >= assignment.max_attempts) {
      throw new Error("No attempts remaining.");
    }

    const active = await client.query<{ id: string }>(
      `SELECT att.id
       FROM assessment_attempts att
       JOIN candidates c ON c.id = att.candidate_id
       WHERE c.user_id = $1
         AND att.assessment_id = $2
         AND att.status = 'in_progress'
       ORDER BY att.started_at DESC
       LIMIT 1`,
      [userId, assignment.assessment_id],
    );
    if (active.rows[0]?.id) {
      await client.query("COMMIT");
      return active.rows[0].id;
    }

    const candidateId = await ensureCandidateId(client, userId);
    const nextAttemptNo = assignment.attempts_used + 1;
    const created = await client.query<{ id: string }>(
      `INSERT INTO assessment_attempts (assessment_id, candidate_id, attempt_number, status)
       VALUES ($1, $2, $3, 'in_progress')
       RETURNING id`,
      [assignment.assessment_id, candidateId, nextAttemptNo],
    );
    const attemptId = created.rows[0]!.id;

    if (assignment.status === "assigned") {
      await client.query(
        `UPDATE assessment_assignments SET status = 'in_progress', updated_at = now() WHERE id = $1`,
        [assignment.id],
      );
    }

    await client.query("COMMIT");
    return attemptId;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function gradeAndSubmitAttemptInDb(input: {
  assignmentId: string;
  attemptId: string;
  userId: string;
  answers: Record<string, string>;
}): Promise<{ score: number; passed: boolean }> {
  const pool = getPgPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const assignment = await loadAssignmentForLearner(client, input.assignmentId, input.userId);
    if (!assignment) throw new Error("Assignment not found");
    if (new Date(assignment.due_at).getTime() <= Date.now()) {
      throw new Error("Time expired — submissions are frozen.");
    }

    const attemptRes = await client.query<{
      id: string;
      assessment_id: string;
      status: string;
      user_id: string;
    }>(
      `SELECT att.id, att.assessment_id, att.status, c.user_id
       FROM assessment_attempts att
       JOIN candidates c ON c.id = att.candidate_id
       WHERE att.id = $1`,
      [input.attemptId],
    );
    const attempt = attemptRes.rows[0];
    if (!attempt) throw new Error("Attempt not found");
    if (attempt.user_id !== input.userId) throw new Error("Not authorized");
    if (attempt.assessment_id !== assignment.assessment_id) {
      throw new Error("Attempt does not match assignment");
    }
    if (attempt.status !== "in_progress") {
      throw new Error("This attempt has already been submitted.");
    }

    const questionsRes = await client.query<{
      id: string;
      type: string;
      correct_answer: string | null;
      options: unknown;
    }>(
      `SELECT id, type, correct_answer, options
       FROM assessment_questions
       WHERE assessment_id = $1`,
      [assignment.assessment_id],
    );
    const questions = questionsRes.rows;

    const assessmentRes = await client.query<{ pass_mark: number }>(
      `SELECT pass_mark FROM assessments WHERE id = $1`,
      [assignment.assessment_id],
    );
    const passMark = assessmentRes.rows[0]?.pass_mark ?? 75;

    const mcqs = questions.filter((q) => q.type === "mcq");
    let correct = 0;
    for (const q of mcqs) {
      const given = input.answers[q.id] ?? "";
      const options = parseOptions(q.options);
      if (mcqAnswersMatch(given, q.correct_answer, options)) correct += 1;
    }
    const score = mcqs.length ? Math.round((correct / mcqs.length) * 100) : 0;
    const passed = score >= passMark;

    if (questions.length) {
      await client.query(`DELETE FROM attempt_answers WHERE attempt_id = $1`, [input.attemptId]);
      for (const q of questions) {
        await client.query(
          `INSERT INTO attempt_answers (attempt_id, question_id, answer) VALUES ($1, $2, $3)`,
          [input.attemptId, q.id, input.answers[q.id] ?? ""],
        );
      }
    }

    await client.query(`SELECT record_attempt_result($1, $2, $3)`, [
      input.attemptId,
      score,
      passed,
    ]);

    await client.query("COMMIT");
    return { score, passed };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function expireAssignmentInDb(
  assignmentId: string,
  userId: string,
): Promise<{ expired: boolean }> {
  const pool = getPgPool();
  const assignment = await getLearnerAssignmentFromDb(assignmentId, userId);
  if (!assignment) throw new Error("Assignment not found");
  await pool.query(`SELECT expire_assignment($1)`, [assignmentId]);
  return { expired: true };
}
