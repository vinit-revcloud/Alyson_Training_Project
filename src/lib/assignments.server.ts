import type { PoolClient } from "pg";
import { getPgPool } from "@/lib/pg.server";
import type {
  AssignmentDetail,
  AssignmentMetrics,
  AssignmentRow,
  AssignmentStatus,
} from "@/lib/test-assignments-api";
import type { UserRow } from "@/lib/assignments-api";

export async function listAssignmentDetailsFromDb(): Promise<AssignmentDetail[]> {
  const pool = getPgPool();
  const { rows } = await pool.query<{
    id: string;
    learner_user_id: string;
    assessment_id: string;
    course_id: string | null;
    assigned_by: string | null;
    source: "manual" | "auto_department";
    mode: "final" | "practice";
    assigned_at: string;
    due_at: string;
    max_attempts: number;
    attempts_used: number;
    last_attempt_id: string | null;
    status: AssignmentStatus;
    created_at: string;
    updated_at: string;
    display_name: string | null;
    email: string | null;
    department: string | null;
    assessment_title: string | null;
    pass_mark: number | null;
    class_id: string | null;
    course_title: string | null;
  }>(
    `SELECT aa.*,
            p.display_name, p.email, p.department,
            a.title AS assessment_title, a.pass_mark, a.class_id,
            c.title AS course_title
     FROM assessment_assignments aa
     LEFT JOIN profiles p ON p.user_id = aa.learner_user_id
     LEFT JOIN assessments a ON a.id = aa.assessment_id
     LEFT JOIN courses c ON c.id = aa.course_id
     ORDER BY aa.assigned_at DESC`,
  );

  return rows.map((r) => ({
    id: r.id,
    learner_user_id: r.learner_user_id,
    assessment_id: r.assessment_id,
    course_id: r.course_id,
    assigned_by: r.assigned_by,
    source: r.source,
    mode: r.mode,
    assigned_at: r.assigned_at,
    due_at: r.due_at,
    max_attempts: r.max_attempts,
    attempts_used: r.attempts_used,
    last_attempt_id: r.last_attempt_id,
    status: r.status,
    created_at: r.created_at,
    updated_at: r.updated_at,
    learner: {
      display_name: r.display_name,
      email: r.email,
      department: r.department,
    },
    assessment: {
      title: r.assessment_title ?? "(missing)",
      pass_mark: r.pass_mark ?? 0,
      class_id: r.class_id ?? "",
    },
    course: r.course_title ? { title: r.course_title } : null,
  }));
}

export async function getAssignmentMetricsFromDb(): Promise<AssignmentMetrics> {
  const pool = getPgPool();
  const [assignmentsRes, attemptsRes, profilesRes, candidatesRes] = await Promise.all([
    pool.query<{ status: AssignmentStatus }>(`SELECT status FROM assessment_assignments`),
    pool.query<{
      candidate_id: string;
      score: number | null;
      passed: boolean | null;
      status: string;
    }>(`SELECT candidate_id, score, passed, status FROM assessment_attempts`),
    pool.query<{ user_id: string; department: string | null }>(
      `SELECT user_id, department FROM profiles`,
    ),
    pool.query<{ id: string; user_id: string | null }>(`SELECT id, user_id FROM candidates`),
  ]);

  const a = assignmentsRes.rows;
  const metrics: AssignmentMetrics = {
    total: a.length,
    assigned: 0,
    in_progress: 0,
    passed: 0,
    failed_capped: 0,
    expired: 0,
    completionPct: 0,
    failureRetakeRate: 0,
    scoresByDepartment: [],
    scoreDistribution: [
      { bucket: "0–20", count: 0 },
      { bucket: "21–40", count: 0 },
      { bucket: "41–60", count: 0 },
      { bucket: "61–80", count: 0 },
      { bucket: "81–100", count: 0 },
    ],
  };
  for (const x of a) metrics[x.status] += 1;
  metrics.completionPct = a.length
    ? Math.round(((metrics.passed + metrics.failed_capped) / a.length) * 100)
    : 0;

  const att = attemptsRes.rows;
  const failed = att.filter((x) => x.passed === false).length;
  const graded = att.filter((x) => x.status === "graded").length;
  metrics.failureRetakeRate = graded ? Math.round((failed / graded) * 100) : 0;

  for (const r of att) {
    if (typeof r.score !== "number") continue;
    const b = Math.min(4, Math.floor(r.score / 20));
    metrics.scoreDistribution[b].count += 1;
  }

  const candUser = new Map(candidatesRes.rows.map((c) => [c.id, c.user_id]));
  const userDept = new Map(
    profilesRes.rows.map((p) => [p.user_id, p.department ?? "—"]),
  );
  const deptAgg = new Map<string, { sum: number; n: number }>();
  for (const r of att) {
    if (typeof r.score !== "number") continue;
    const dept = userDept.get(candUser.get(r.candidate_id) ?? "") ?? "—";
    const cur = deptAgg.get(dept) ?? { sum: 0, n: 0 };
    cur.sum += r.score;
    cur.n += 1;
    deptAgg.set(dept, cur);
  }
  metrics.scoresByDepartment = Array.from(deptAgg.entries()).map(([department, v]) => ({
    department,
    avgScore: Math.round(v.sum / v.n),
    attempts: v.n,
  }));

  return metrics;
}

async function resolveCourseIdForAssessment(
  client: PoolClient,
  assessmentId: string,
): Promise<string | null> {
  const { rows } = await client.query<{ course_id: string | null }>(
    `SELECT cl.course_id
     FROM assessments a
     JOIN classes cl ON cl.id = a.class_id
     WHERE a.id = $1`,
    [assessmentId],
  );
  return rows[0]?.course_id ?? null;
}

async function assertLearnerTrainee(client: PoolClient, userId: string): Promise<void> {
  const { rows } = await client.query<{ ok: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM user_roles WHERE user_id = $1 AND role = 'trainee'
     ) AS ok`,
    [userId],
  );
  if (!rows[0]?.ok) {
    throw new Error("Selected user is not a trainee — only learners can receive test assignments");
  }
}

async function assertAssessmentAssignable(client: PoolClient, assessmentId: string): Promise<void> {
  const { rows } = await client.query<{ status: string; purpose: string }>(
    `SELECT status, purpose FROM assessments WHERE id = $1`,
    [assessmentId],
  );
  const row = rows[0];
  if (!row || !["validated", "published"].includes(row.status)) {
    throw new Error("Test must be validated or published before assignment");
  }
  if (row.purpose === "interview") {
    throw new Error(
      "Interview assessments cannot be assigned to trainees — schedule them from Interviews",
    );
  }
}

export async function createManualAssignmentInDb(input: {
  learnerUserId: string;
  assessmentId: string;
  courseId?: string | null;
  dueAt?: string;
  maxAttempts?: number;
  assignedBy: string;
}): Promise<AssignmentRow> {
  const pool = getPgPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assertLearnerTrainee(client, input.learnerUserId);
    await assertAssessmentAssignable(client, input.assessmentId);

    const courseId =
      input.courseId ??
      (await resolveCourseIdForAssessment(client, input.assessmentId));

    const dueAt =
      input.dueAt ?? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

    const { rows } = await client.query<AssignmentRow>(
      `INSERT INTO assessment_assignments (
        learner_user_id, assessment_id, course_id, assigned_by,
        source, mode, due_at, max_attempts, status
      ) VALUES ($1, $2, $3, $4, 'manual', 'final', $5, $6, 'assigned')
      ON CONFLICT (learner_user_id, assessment_id) DO UPDATE SET
        course_id = EXCLUDED.course_id,
        assigned_by = EXCLUDED.assigned_by,
        due_at = EXCLUDED.due_at,
        max_attempts = EXCLUDED.max_attempts,
        status = 'assigned',
        updated_at = now()
      RETURNING *`,
      [
        input.learnerUserId,
        input.assessmentId,
        courseId,
        input.assignedBy,
        dueAt,
        input.maxAttempts ?? 3,
      ],
    );

    await client.query("COMMIT");
    return rows[0];
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function autoAssignCourseToDepartmentInDb(
  courseId: string,
  department: string,
): Promise<{
  usersTouched: number;
  assignmentsCreated: number;
  newAssignmentIds: string[];
}> {
  const pool = getPgPool();
  const client = await pool.connect();
  const trimmedDept = department.trim();
  if (!trimmedDept) throw new Error("Department is required");

  try {
    await client.query("BEGIN");

    const { rows: courseRows } = await client.query<{ id: string }>(
      `SELECT id FROM courses WHERE id = $1`,
      [courseId],
    );
    if (!courseRows.length) throw new Error("Course not found");

    const { rows: deptRows } = await client.query<{ department: string }>(
      `SELECT department FROM course_departments WHERE course_id = $1`,
      [courseId],
    );
    if (deptRows.length && !deptRows.some((d) => d.department === trimmedDept)) {
      throw new Error(
        `Department "${trimmedDept}" is not linked to this course — add it under Courses first`,
      );
    }

    let assignmentsCreated = 0;
    const newAssignmentIds: string[] = [];
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO assessment_assignments (learner_user_id, assessment_id, course_id, source)
       SELECT DISTINCT p.user_id, a.id, $1, 'auto_department'
       FROM profiles p
       JOIN user_roles ur ON ur.user_id = p.user_id AND ur.role = 'trainee'
       JOIN assessments a ON a.is_primary = true AND a.status IN ('validated', 'published')
       JOIN classes cl ON cl.id = a.class_id AND cl.course_id = $1
       WHERE p.department = $2
       ON CONFLICT (learner_user_id, assessment_id) DO NOTHING
       RETURNING id`,
      [courseId, trimmedDept],
    );
    assignmentsCreated = inserted.rowCount ?? 0;
    newAssignmentIds.push(...inserted.rows.map((r) => r.id));

    const { rows: members } = await client.query<{ user_id: string }>(
      `SELECT DISTINCT p.user_id
       FROM profiles p
       JOIN user_roles ur ON ur.user_id = p.user_id AND ur.role = 'trainee'
       WHERE p.department = $1`,
      [trimmedDept],
    );

    await client.query("COMMIT");
    return { usersTouched: members.length, assignmentsCreated, newAssignmentIds };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function listUsersForAssignmentFromDb(): Promise<UserRow[]> {
  const pool = getPgPool();
  const { rows } = await pool.query<{
    user_id: string;
    display_name: string | null;
    email: string | null;
    department: string | null;
    roles: string[];
    assigned_courses: number;
  }>(
    `WITH courses_by_dept AS (
       SELECT cd.department, COUNT(DISTINCT cd.course_id)::int AS n
       FROM course_departments cd
       GROUP BY cd.department
     )
     SELECT p.user_id, p.display_name, p.email, p.department,
            COALESCE(array_agg(ur.role::text) FILTER (WHERE ur.role IS NOT NULL), '{}') AS roles,
            COALESCE(cbd.n, 0) AS assigned_courses
     FROM profiles p
     JOIN user_roles ur ON ur.user_id = p.user_id
     LEFT JOIN courses_by_dept cbd ON cbd.department = p.department
     GROUP BY p.user_id, p.display_name, p.email, p.department, cbd.n
     ORDER BY p.display_name NULLS LAST`,
  );

  return rows.map((r) => ({
    user_id: r.user_id,
    display_name: r.display_name,
    email: r.email,
    department: r.department,
    roles: r.roles,
    assigned_courses: r.assigned_courses,
  }));
}

export async function updateUserDepartmentInDb(
  userId: string,
  department: string | null,
): Promise<void> {
  const pool = getPgPool();
  const { rowCount } = await pool.query(
    `UPDATE profiles SET department = $2, updated_at = now() WHERE user_id = $1`,
    [userId, department],
  );
  if (!rowCount) throw new Error("User profile not found");
}

export async function getAllCourseDepartmentsFromDb(): Promise<Map<string, string[]>> {
  const pool = getPgPool();
  const { rows } = await pool.query<{ course_id: string; department: string }>(
    `SELECT course_id, department FROM course_departments ORDER BY course_id, department`,
  );
  const map = new Map<string, string[]>();
  for (const row of rows) {
    const arr = map.get(row.course_id) ?? [];
    arr.push(row.department);
    map.set(row.course_id, arr);
  }
  return map;
}

export async function getCourseDepartmentsFromDb(courseId: string): Promise<string[]> {
  const pool = getPgPool();
  const { rows } = await pool.query<{ department: string }>(
    `SELECT department FROM course_departments WHERE course_id = $1 ORDER BY department`,
    [courseId],
  );
  return rows.map((r) => r.department);
}

export async function assignAssessmentInDb(input: {
  assessmentId: string;
  learnerUserIds: string[];
  dueAt: string;
  mode?: "final" | "practice";
  maxAttempts?: number;
  courseId?: string | null;
  assignedBy: string;
}): Promise<string[]> {
  if (!input.learnerUserIds.length) return [];

  const pool = getPgPool();
  const client = await pool.connect();
  const assignmentIds: string[] = [];

  try {
    await client.query("BEGIN");
    await assertAssessmentAssignable(client, input.assessmentId);

    const courseId =
      input.courseId ??
      (await resolveCourseIdForAssessment(client, input.assessmentId));

    for (const learnerUserId of input.learnerUserIds) {
      await assertLearnerTrainee(client, learnerUserId);
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO assessment_assignments (
          learner_user_id, assessment_id, course_id, assigned_by,
          source, mode, due_at, max_attempts, status
        ) VALUES ($1, $2, $3, $4, 'manual', $5, $6, $7, 'assigned')
        ON CONFLICT (learner_user_id, assessment_id) DO UPDATE SET
          course_id = EXCLUDED.course_id,
          assigned_by = EXCLUDED.assigned_by,
          due_at = EXCLUDED.due_at,
          max_attempts = EXCLUDED.max_attempts,
          mode = EXCLUDED.mode,
          status = 'assigned',
          updated_at = now()
        RETURNING id`,
        [
          learnerUserId,
          input.assessmentId,
          courseId,
          input.assignedBy,
          input.mode ?? "final",
          input.dueAt,
          input.maxAttempts ?? 3,
        ],
      );
      assignmentIds.push(rows[0].id);
    }

    await client.query("COMMIT");
    return assignmentIds;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function reorderClassesInDb(courseId: string, classIds: string[]): Promise<void> {
  const pool = getPgPool();
  await Promise.all(
    classIds.map((id, idx) =>
      pool.query(`UPDATE classes SET position = $1 WHERE id = $2 AND course_id = $3`, [
        idx,
        id,
        courseId,
      ]),
    ),
  );
}

export async function reorderSectionsInDb(classId: string, sectionIds: string[]): Promise<void> {
  const pool = getPgPool();
  await Promise.all(
    sectionIds.map((id, idx) =>
      pool.query(`UPDATE sections SET position = $1 WHERE id = $2 AND class_id = $3`, [
        idx,
        id,
        classId,
      ]),
    ),
  );
}

export async function moveSectionToClassInDb(
  sectionId: string,
  targetClassId: string,
  position: number,
): Promise<void> {
  const pool = getPgPool();
  await pool.query(`UPDATE sections SET class_id = $1, position = $2 WHERE id = $3`, [
    targetClassId,
    position,
    sectionId,
  ]);
}

export async function getCourseTreeFromDb(courseId: string) {
  const pool = getPgPool();
  const classesRes = await pool.query<{
    id: string;
    name: string;
    status: string;
    position: number | null;
    level: string;
  }>(
    `SELECT id, name, status, position, level FROM classes
     WHERE course_id = $1 ORDER BY position ASC`,
    [courseId],
  );
  const cls = classesRes.rows;
  if (!cls.length) return [];

  const classIds = cls.map((c) => c.id);
  const sectionsRes = await pool.query<{
    id: string;
    class_id: string;
    title: string;
    position: number | null;
  }>(
    `SELECT id, class_id, title, position FROM sections
     WHERE class_id = ANY($1::uuid[]) ORDER BY position ASC`,
    [classIds],
  );
  const secs = sectionsRes.rows;
  const sectionIds = secs.map((s) => s.id);

  const [assetsRes, questionsRes] = await Promise.all([
    sectionIds.length
      ? pool.query<{ section_id: string }>(
          `SELECT section_id FROM section_assets WHERE section_id = ANY($1::uuid[])`,
          [sectionIds],
        )
      : Promise.resolve({ rows: [] as { section_id: string }[] }),
    sectionIds.length
      ? pool.query<{ section_id: string }>(
          `SELECT section_id FROM section_questions WHERE section_id = ANY($1::uuid[])`,
          [sectionIds],
        )
      : Promise.resolve({ rows: [] as { section_id: string }[] }),
  ]);

  const assetCounts = new Map<string, number>();
  for (const a of assetsRes.rows) {
    assetCounts.set(a.section_id, (assetCounts.get(a.section_id) ?? 0) + 1);
  }
  const qCounts = new Map<string, number>();
  for (const q of questionsRes.rows) {
    qCounts.set(q.section_id, (qCounts.get(q.section_id) ?? 0) + 1);
  }

  return cls.map((c) => ({
    id: c.id,
    name: c.name,
    status: c.status,
    position: c.position ?? 0,
    level: c.level,
    sections: secs
      .filter((s) => s.class_id === c.id)
      .map((s) => ({
        id: s.id,
        title: s.title,
        position: s.position ?? 0,
        asset_count: assetCounts.get(s.id) ?? 0,
        question_count: qCounts.get(s.id) ?? 0,
      })),
  }));
}

export async function listPickableAssessmentsFromDb() {
  const pool = getPgPool();
  const { rows } = await pool.query<{
    id: string;
    title: string;
    status: string;
    class_id: string;
  }>(
    `SELECT id, title, status, class_id FROM assessments
     WHERE status IN ('validated', 'published')
       AND (purpose IS NULL OR purpose = 'training')
     ORDER BY updated_at DESC`,
  );
  return rows;
}

export async function listCourseTitlesFromDb() {
  const pool = getPgPool();
  const { rows } = await pool.query<{ id: string; title: string }>(
    `SELECT id, title FROM courses ORDER BY title`,
  );
  return rows;
}

export async function setCourseDepartmentsInDb(
  courseId: string,
  departments: string[],
): Promise<void> {
  const desired = Array.from(new Set(departments.map((d) => d.trim()).filter(Boolean)));
  const pool = getPgPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: currentRows } = await client.query<{ department: string }>(
      `SELECT department FROM course_departments WHERE course_id = $1`,
      [courseId],
    );
    const current = currentRows.map((r) => r.department);
    const toRemove = current.filter((d) => !desired.includes(d));
    const toAdd = desired.filter((d) => !current.includes(d));

    if (toRemove.length) {
      await client.query(
        `DELETE FROM course_departments
         WHERE course_id = $1 AND department = ANY($2::text[])`,
        [courseId, toRemove],
      );
    }
    for (const department of toAdd) {
      await client.query(
        `INSERT INTO course_departments (course_id, department)
         VALUES ($1, $2)
         ON CONFLICT (course_id, department) DO NOTHING`,
        [courseId, department],
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
