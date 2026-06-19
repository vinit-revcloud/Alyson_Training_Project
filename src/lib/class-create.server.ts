import type { PoolClient } from "pg";
import { getPgPool } from "@/lib/pg.server";
import type { ClassStatus, Level } from "@/lib/class-create.validation";

const COVERS = [
  "from-blue-500 to-indigo-600",
  "from-violet-500 to-purple-600",
  "from-emerald-500 to-teal-600",
  "from-orange-500 to-pink-600",
  "from-amber-500 to-yellow-600",
  "from-rose-500 to-red-600",
];

export interface CreateClassSectionInput {
  title: string;
  description: string;
  durationMin: number;
  objectives: string;
  position: number;
  videoLink?: string;
}

export interface CreateClassDbInput {
  name: string;
  parentCourse: string;
  level: Level;
  audience: string;
  summary: string;
  topics: string[];
  sections: CreateClassSectionInput[];
  test: {
    difficulty: Level;
    mcqCount: number;
    subjectiveCount: number;
    passMark: number;
    retest: boolean;
  };
  status: ClassStatus;
}

export interface CreateClassDbResult {
  classId: string;
  courseId: string;
  sections: Array<{ id: string; position: number }>;
}

async function findOrCreateCourse(
  client: PoolClient,
  title: string,
  role: string,
  level: string,
  classStatus: ClassStatus,
  userId: string,
): Promise<string> {
  const normalizedTitle = title.trim();
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM courses WHERE LOWER(TRIM(title)) = LOWER($1) LIMIT 1`,
    [normalizedTitle],
  );
  if (existing.rows[0]?.id) return existing.rows[0].id;

  const cover = COVERS[Math.floor(Math.random() * COVERS.length)];
  const courseStatus = classStatus === "published" ? "published" : "draft";
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO courses (title, role, level, cover, description, status, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      normalizedTitle,
      role,
      level,
      cover,
      `${normalizedTitle} — managed via Alyson Training Project.`,
      courseStatus,
      userId,
    ],
  );
  return inserted.rows[0].id;
}

async function setCourseDepartment(
  client: PoolClient,
  courseId: string,
  department: string,
): Promise<void> {
  const trimmed = department.trim();
  if (!trimmed) return;
  await client.query(
    `INSERT INTO course_departments (course_id, department)
     VALUES ($1, $2)
     ON CONFLICT (course_id, department) DO NOTHING`,
    [courseId, trimmed],
  );
}

/** Atomic course + class + sections (+ video links). Uses direct Postgres to bypass Data API grants/RLS. */
export async function createClassRecordsInDb(
  input: CreateClassDbInput,
  userId: string,
): Promise<CreateClassDbResult> {
  const pool = getPgPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const courseId = await findOrCreateCourse(
      client,
      input.parentCourse.trim(),
      input.audience,
      input.level,
      input.status,
      userId,
    );

    if (input.audience?.trim()) {
      await setCourseDepartment(client, courseId, input.audience);
    }

    const maxRes = await client.query<{ max: number | null }>(
      `SELECT COALESCE(MAX(position), -1) AS max FROM classes WHERE course_id = $1`,
      [courseId],
    );
    const classPosition = (maxRes.rows[0]?.max ?? -1) + 1;

    const classInsert = await client.query<{ id: string }>(
      `INSERT INTO classes (
        course_id, name, summary, level, audience, topics, status, position,
        test_difficulty, test_mcq_count, test_subjective_count, test_pass_mark, test_retest
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING id`,
      [
        courseId,
        input.name,
        input.summary,
        input.level,
        input.audience,
        input.topics,
        input.status,
        classPosition,
        input.test.difficulty,
        input.test.mcqCount,
        input.test.subjectiveCount,
        input.test.passMark,
        input.test.retest,
      ],
    );
    const classId = classInsert.rows[0].id;

    if (input.topics.length) {
      const topicsRes = await client.query<{ topics: string[] | null }>(
        `SELECT topics FROM courses WHERE id = $1`,
        [courseId],
      );
      const merged = Array.from(new Set([...(topicsRes.rows[0]?.topics ?? []), ...input.topics]));
      await client.query(`UPDATE courses SET topics = $2, updated_at = now() WHERE id = $1`, [
        courseId,
        merged,
      ]);
    } else {
      await client.query(`UPDATE courses SET updated_at = now() WHERE id = $1`, [courseId]);
    }

    const sectionRows: Array<{ id: string; position: number }> = [];
    for (const sec of input.sections) {
      const secInsert = await client.query<{ id: string }>(
        `INSERT INTO sections (
          class_id, title, description, duration_min, objectives, position
        ) VALUES ($1,$2,$3,$4,$5,$6)
        RETURNING id`,
        [classId, sec.title, sec.description, sec.durationMin, sec.objectives, sec.position],
      );
      const sectionId = secInsert.rows[0].id;
      sectionRows.push({ id: sectionId, position: sec.position });

      if (sec.videoLink?.trim()) {
        await client.query(
          `INSERT INTO section_assets (section_id, kind, external_url, file_name)
           VALUES ($1, 'video_link', $2, $2)`,
          [sectionId, sec.videoLink.trim()],
        );
      }
    }

    await client.query("COMMIT");
    return { classId, courseId, sections: sectionRows };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
