import type { Pool, PoolClient } from "pg";
import type { ClassStatus } from "@/lib/class-create.validation";

type Db = Pool | PoolClient;

/** When a class goes live, the parent course must be published and tagged for the audience department. */
export async function promoteCourseForLearners(
  db: Db,
  courseId: string,
  audience?: string | null,
): Promise<void> {
  await db.query(`UPDATE courses SET status = 'published', updated_at = now() WHERE id = $1`, [
    courseId,
  ]);

  const trimmed = audience?.trim();
  if (trimmed) {
    await db.query(
      `INSERT INTO course_departments (course_id, department)
       VALUES ($1, $2)
       ON CONFLICT (course_id, department) DO NOTHING`,
      [courseId, trimmed],
    );
  }
}

export async function syncCourseOnClassStatus(
  db: Db,
  courseId: string | null,
  classStatus: ClassStatus,
  audience?: string | null,
): Promise<void> {
  if (!courseId || classStatus !== "published") return;
  await promoteCourseForLearners(db, courseId, audience);
}
