import { getPgPool } from "@/lib/pg.server";
import type { ClassStatus } from "@/lib/class-create.validation";
import { syncCourseOnClassStatus } from "@/lib/class-publish.server";
import { gatherClassMaterialPg } from "@/lib/ai/section-material.server";
import type {
  ClassAssessmentSeed,
  ClassRow,
  CourseRow,
  CourseWithStats,
  SectionAssetRow,
  SectionQuestionRow,
  SectionRow,
} from "@/lib/classes-api";
import type { Question } from "@/lib/test-types";

export async function listCoursesFromDb(): Promise<CourseWithStats[]> {
  const pool = getPgPool();
  const coursesRes = await pool.query<CourseRow>(
    `SELECT * FROM courses ORDER BY updated_at DESC LIMIT 500`,
  );
  const courses = coursesRes.rows;
  if (!courses.length) return [];

  const ids = courses.map((c) => c.id);
  const classesRes = await pool.query<{ course_id: string | null; status: string }>(
    `SELECT course_id, status FROM classes WHERE course_id = ANY($1::uuid[])`,
    [ids],
  );

  const counts = new Map<string, number>();
  const statuses = new Map<string, Set<string>>();
  for (const c of classesRes.rows) {
    if (!c.course_id) continue;
    counts.set(c.course_id, (counts.get(c.course_id) ?? 0) + 1);
    if (!statuses.has(c.course_id)) statuses.set(c.course_id, new Set());
    statuses.get(c.course_id)!.add(c.status);
  }

  return courses.map((c) => {
    const s = statuses.get(c.id) ?? new Set<string>();
    const derived: ClassStatus = s.has("published")
      ? "published"
      : s.has("in-review")
        ? "in-review"
        : "draft";
    return {
      ...c,
      enrolled: 0,
      completion: 0,
      classCount: counts.get(c.id) ?? 0,
      derivedStatus: derived,
    };
  });
}

export async function listClassesForCountsFromDb(): Promise<ClassRow[]> {
  const pool = getPgPool();
  const { rows } = await pool.query<ClassRow>(
    `SELECT * FROM classes ORDER BY updated_at DESC LIMIT 1000`,
  );
  return rows;
}

export async function getCourseFromDb(courseId: string): Promise<CourseRow | null> {
  const pool = getPgPool();
  const { rows } = await pool.query<CourseRow>(`SELECT * FROM courses WHERE id = $1`, [courseId]);
  return rows[0] ?? null;
}

export async function setCourseCoreOnboardingInDb(
  courseId: string,
  isCore: boolean,
): Promise<void> {
  const pool = getPgPool();
  await pool.query(`UPDATE courses SET is_core_onboarding = $2, updated_at = now() WHERE id = $1`, [
    courseId,
    isCore,
  ]);
}

export async function listClassesForCourseFromDb(courseId: string): Promise<ClassRow[]> {
  const pool = getPgPool();
  const { rows } = await pool.query<ClassRow>(
    `SELECT * FROM classes WHERE course_id = $1 ORDER BY updated_at DESC`,
    [courseId],
  );
  return rows;
}

export async function getClassFromDb(classId: string): Promise<ClassRow | null> {
  const pool = getPgPool();
  const { rows } = await pool.query<ClassRow>(`SELECT * FROM classes WHERE id = $1`, [classId]);
  return rows[0] ?? null;
}

export async function listSectionsWithAssetsFromDb(
  classId: string,
): Promise<Array<SectionRow & { assets: SectionAssetRow[] }>> {
  const pool = getPgPool();
  const sectionsRes = await pool.query<SectionRow>(
    `SELECT * FROM sections WHERE class_id = $1 ORDER BY position ASC`,
    [classId],
  );
  const secs = sectionsRes.rows;
  if (!secs.length) return [];

  const sectionIds = secs.map((s) => s.id);
  const assetsRes = await pool.query<SectionAssetRow>(
    `SELECT * FROM section_assets WHERE section_id = ANY($1::uuid[])`,
    [sectionIds],
  );
  const assets = assetsRes.rows;

  return secs.map((s) => ({
    ...s,
    assets: assets.filter((a) => a.section_id === s.id),
  }));
}

export async function listSectionQuestionsFromDb(sectionId: string): Promise<SectionQuestionRow[]> {
  const pool = getPgPool();
  const { rows } = await pool.query<SectionQuestionRow>(
    `SELECT * FROM section_questions WHERE section_id = $1 ORDER BY position ASC`,
    [sectionId],
  );
  return rows;
}

export async function getClassAssessmentSeedFromDb(classId: string): Promise<ClassAssessmentSeed> {
  const cls = await getClassFromDb(classId);
  const sections = await listSectionsWithAssetsFromDb(classId);
  const sectionIds = sections.map((s) => s.id);

  let rows: SectionQuestionRow[] = [];
  if (sectionIds.length) {
    const pool = getPgPool();
    const qRes = await pool.query<SectionQuestionRow>(
      `SELECT * FROM section_questions WHERE section_id = ANY($1::uuid[]) ORDER BY position ASC`,
      [sectionIds],
    );
    rows = qRes.rows;
  }

  const { materialText, fileNames } = await gatherClassMaterialPg(classId);
  const fileNamesFromAssets = sections.flatMap((s) => s.assets.map((a) => a.file_name));
  const mergedFileNames = [...new Set([...fileNames, ...fileNamesFromAssets])];

  const questions = rows.map((q, i) => ({
    id: q.id ?? `section-q-${i}`,
    type: q.type === "subjective" ? "subjective" : "mcq",
    topic: q.topic || "Class material",
    difficulty: q.difficulty === "hard" ? "hard" : q.difficulty === "easy" ? "easy" : "medium",
    prompt: q.prompt,
    options: Array.isArray(q.options)
      ? q.options.filter((o): o is string => typeof o === "string")
      : undefined,
    correctAnswer: q.correct_answer ?? undefined,
    rubric: q.rubric ?? undefined,
  })) satisfies Question[];

  return {
    materialText,
    fileNames: mergedFileNames,
    questions,
    sectionCount: sections.length,
    assetCount: mergedFileNames.length,
  };
}

export async function updateClassStatusInDb(classId: string, status: ClassStatus): Promise<void> {
  const pool = getPgPool();
  const clsRes = await pool.query<{ course_id: string | null; audience: string | null }>(
    `SELECT course_id, audience FROM classes WHERE id = $1`,
    [classId],
  );
  const cls = clsRes.rows[0];
  if (!cls) throw new Error("Class not found");

  const { rowCount } = await pool.query(
    `UPDATE classes SET status = $2, updated_at = now() WHERE id = $1`,
    [classId, status],
  );
  if (!rowCount) throw new Error("Class not found");

  await syncCourseOnClassStatus(pool, cls.course_id, status, cls.audience);
}

export async function updateClassMetaInDb(
  classId: string,
  patch: Partial<Pick<ClassRow, "name" | "summary" | "audience" | "level" | "topics">>,
): Promise<void> {
  const fields: string[] = [];
  const values: unknown[] = [classId];
  let i = 2;
  for (const key of ["name", "summary", "audience", "level", "topics"] as const) {
    if (patch[key] !== undefined) {
      fields.push(`${key} = $${i}`);
      values.push(patch[key]);
      i++;
    }
  }
  if (!fields.length) return;
  fields.push("updated_at = now()");
  const pool = getPgPool();
  const { rowCount } = await pool.query(
    `UPDATE classes SET ${fields.join(", ")} WHERE id = $1`,
    values,
  );
  if (!rowCount) throw new Error("Class not found");
}

export async function updateSectionInDb(
  sectionId: string,
  patch: Partial<Pick<SectionRow, "title" | "description" | "duration_min" | "objectives" | "position">>,
): Promise<void> {
  const fields: string[] = [];
  const values: unknown[] = [sectionId];
  let i = 2;
  for (const key of ["title", "description", "duration_min", "objectives", "position"] as const) {
    if (patch[key] !== undefined) {
      fields.push(`${key} = $${i}`);
      values.push(patch[key]);
      i++;
    }
  }
  if (!fields.length) return;
  const pool = getPgPool();
  const { rowCount } = await pool.query(
    `UPDATE sections SET ${fields.join(", ")} WHERE id = $1`,
    values,
  );
  if (!rowCount) throw new Error("Section not found");
}

export async function addSectionInDb(
  classId: string,
  data: { title: string; description?: string; duration_min?: number; objectives?: string },
): Promise<SectionRow> {
  const pool = getPgPool();
  const posRes = await pool.query<{ position: number }>(
    `SELECT position FROM sections WHERE class_id = $1 ORDER BY position DESC LIMIT 1`,
    [classId],
  );
  const nextPos = (posRes.rows[0]?.position ?? -1) + 1;
  const { rows } = await pool.query<SectionRow>(
    `INSERT INTO sections (class_id, title, description, duration_min, objectives, position)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      classId,
      data.title,
      data.description ?? "",
      data.duration_min ?? 0,
      data.objectives ?? "",
      nextPos,
    ],
  );
  return rows[0];
}

export async function getSectionAssetsBySectionIdFromDb(sectionId: string): Promise<SectionAssetRow[]> {
  const pool = getPgPool();
  const { rows } = await pool.query<SectionAssetRow>(
    `SELECT * FROM section_assets WHERE section_id = $1`,
    [sectionId],
  );
  return rows;
}

export async function getSectionAssetByIdFromDb(assetId: string): Promise<SectionAssetRow | null> {
  const pool = getPgPool();
  const { rows } = await pool.query<SectionAssetRow>(
    `SELECT * FROM section_assets WHERE id = $1`,
    [assetId],
  );
  return rows[0] ?? null;
}

export async function deleteSectionInDb(sectionId: string): Promise<void> {
  const pool = getPgPool();
  await pool.query(`DELETE FROM section_assets WHERE section_id = $1`, [sectionId]);
  const { rowCount } = await pool.query(`DELETE FROM sections WHERE id = $1`, [sectionId]);
  if (!rowCount) throw new Error("Section not found");
}

export async function insertSectionAssetInDb(input: {
  sectionId: string;
  kind: string;
  storageBucket?: string | null;
  storagePath?: string | null;
  externalUrl?: string | null;
  fileName: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
}): Promise<string> {
  const pool = getPgPool();
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO section_assets (
      section_id, kind, storage_bucket, storage_path, external_url,
      file_name, mime_type, size_bytes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING id`,
    [
      input.sectionId,
      input.kind,
      input.storageBucket ?? null,
      input.storagePath ?? null,
      input.externalUrl ?? null,
      input.fileName,
      input.mimeType ?? null,
      input.sizeBytes ?? null,
    ],
  );
  return rows[0].id;
}

export async function addSectionVideoLinkInDb(sectionId: string, url: string): Promise<void> {
  const pool = getPgPool();
  await pool.query(
    `INSERT INTO section_assets (section_id, kind, external_url, file_name)
     VALUES ($1, 'video_link', $2, $2)`,
    [sectionId, url],
  );
}

export async function deleteSectionAssetInDb(assetId: string): Promise<void> {
  const pool = getPgPool();
  const { rowCount } = await pool.query(`DELETE FROM section_assets WHERE id = $1`, [assetId]);
  if (!rowCount) throw new Error("Asset not found");
}

export async function deleteClassInDb(classId: string): Promise<void> {
  const pool = getPgPool();
  const { deleteAssetFile } = await import("@/lib/asset-storage.server");
  const { rows: assets } = await pool.query<{
    storage_bucket: string | null;
    storage_path: string | null;
  }>(
    `SELECT sa.storage_bucket, sa.storage_path
     FROM section_assets sa
     JOIN sections s ON s.id = sa.section_id
     WHERE s.class_id = $1`,
    [classId],
  );
  for (const asset of assets) {
    if (asset.storage_bucket && asset.storage_path) {
      await deleteAssetFile(
        asset.storage_bucket as import("@/lib/asset-storage.shared").AssetBucket,
        asset.storage_path,
      );
    }
  }
  const { rowCount } = await pool.query(`DELETE FROM classes WHERE id = $1`, [classId]);
  if (!rowCount) throw new Error("Class not found");
}
