import { getPgPool } from "@/lib/pg.server";
import { userHasContentManagerRole } from "@/lib/content-manager.server";

export interface LearnerVisibleCourse {
  id: string;
  title: string;
  is_core_onboarding: boolean;
}

/** Published courses with at least one published class section — for learner nav/dashboard. */
export async function getLearnerVisibleCoursesForUser(
  userId: string,
): Promise<LearnerVisibleCourse[]> {
  const pool = getPgPool();

  if (await userHasContentManagerRole(userId)) {
    const { rows } = await pool.query<LearnerVisibleCourse>(
      `SELECT DISTINCT c.id, c.title, c.is_core_onboarding
       FROM courses c
       JOIN classes cl ON cl.course_id = c.id AND cl.status = 'published'
       JOIN sections s ON s.class_id = cl.id
       WHERE c.status = 'published'
       ORDER BY c.is_core_onboarding DESC, c.title ASC`,
    );
    return rows;
  }

  const accessible = [...(await getAccessibleCourseIdsForUser(userId))];
  if (!accessible.length) return [];

  const { rows } = await pool.query<LearnerVisibleCourse>(
    `SELECT c.id, c.title, c.is_core_onboarding
     FROM courses c
     WHERE c.id = ANY($1::uuid[])
       AND c.status = 'published'
       AND EXISTS (
         SELECT 1 FROM sections s
         JOIN classes cl ON cl.id = s.class_id
         WHERE cl.course_id = c.id AND cl.status = 'published'
       )
     ORDER BY c.is_core_onboarding DESC, c.title ASC`,
    [accessible],
  );
  return rows;
}

/** Course IDs a learner may access (core onboarding, department, assigned paths). */
export async function getAccessibleCourseIdsForUser(userId: string): Promise<Set<string>> {
  const pool = getPgPool();
  const profileRes = await pool.query<{ department: string | null }>(
    `SELECT department FROM profiles WHERE user_id = $1`,
    [userId],
  );
  const dept = profileRes.rows[0]?.department;

  const [coreRes, deptRes, pathRes] = await Promise.all([
    pool.query<{ id: string }>(
      `SELECT id FROM courses WHERE is_core_onboarding = true AND status = 'published'`,
    ),
    dept
      ? pool.query<{ course_id: string }>(
          `SELECT cd.course_id
           FROM course_departments cd
           JOIN courses c ON c.id = cd.course_id
           WHERE cd.department = $1 AND c.status = 'published'`,
          [dept],
        )
      : Promise.resolve({ rows: [] as { course_id: string }[] }),
    pool.query<{ course_id: string }>(
      `SELECT lpa.course_id
       FROM learner_path_assignments lpa
       JOIN courses c ON c.id = lpa.course_id
       WHERE lpa.user_id = $1 AND c.status = 'published'`,
      [userId],
    ),
  ]);

  return new Set([
    ...coreRes.rows.map((r) => r.id),
    ...deptRes.rows.map((r) => r.course_id),
    ...pathRes.rows.map((r) => r.course_id),
  ]);
}

export async function assertLearnerCourseAccess(userId: string, courseId: string): Promise<void> {
  if (await userHasContentManagerRole(userId)) return;
  const ids = await getAccessibleCourseIdsForUser(userId);
  if (!ids.has(courseId)) {
    throw new Error("You do not have access to this course");
  }
}
