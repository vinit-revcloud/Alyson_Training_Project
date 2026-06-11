import type { PoolClient } from "pg";
import { getPgPool } from "@/lib/pg.server";
import type { BulkClassInput, BulkImportPayload } from "@/lib/class-bulk-import.shared";
import { normalizeBulkClass } from "@/lib/class-bulk-import.shared";

export interface BulkCreateResult {
  courseId: string;
  created: Array<{ classId: string; name: string; order: number }>;
}

async function assertCourseExists(client: PoolClient, courseId: string): Promise<void> {
  const { rowCount } = await client.query(`SELECT 1 FROM courses WHERE id = $1`, [courseId]);
  if (!rowCount) throw new Error("Course not found");
}

function fileNameFromUrl(url: string, fallback: string): string {
  try {
    const segment = new URL(url).pathname.split("/").filter(Boolean).pop();
    return segment && segment.length > 0 ? decodeURIComponent(segment) : fallback;
  } catch {
    return fallback;
  }
}

async function insertExternalAsset(
  client: PoolClient,
  sectionId: string,
  kind: "video_link" | "document" | "transcript",
  url: string,
): Promise<void> {
  const fallback = kind === "transcript" ? "transcript" : kind === "document" ? "document" : url;
  const fileName = kind === "video_link" ? url : fileNameFromUrl(url, fallback);
  await client.query(
    `INSERT INTO section_assets (section_id, kind, external_url, file_name)
     VALUES ($1, $2, $3, $4)`,
    [sectionId, kind, url, fileName],
  );
}

async function insertClassWithSections(
  client: PoolClient,
  courseId: string,
  input: BulkClassInput,
  position: number,
): Promise<string> {
  const cls = normalizeBulkClass(input);
  const test = cls.test!;

  const classInsert = await client.query<{ id: string }>(
    `INSERT INTO classes (
      course_id, name, summary, level, audience, topics, status, position,
      test_difficulty, test_mcq_count, test_subjective_count, test_pass_mark, test_retest
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    RETURNING id`,
    [
      courseId,
      cls.name,
      cls.summary,
      cls.level,
      cls.audience,
      cls.topics,
      cls.status,
      position,
      test.difficulty,
      test.mcqCount,
      test.subjectiveCount,
      test.passMark,
      test.retest,
    ],
  );
  const classId = classInsert.rows[0].id;

  for (const sec of cls.sections) {
    const secInsert = await client.query<{ id: string }>(
      `INSERT INTO sections (
        class_id, title, description, duration_min, objectives, position
      ) VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING id`,
      [classId, sec.title, sec.description, sec.durationMin, sec.objectives, sec.order],
    );
    const sectionId = secInsert.rows[0].id;
    if (sec.videoLink) {
      await insertExternalAsset(client, sectionId, "video_link", sec.videoLink);
    }
    for (const docUrl of sec.documentLinks) {
      await insertExternalAsset(client, sectionId, "document", docUrl);
    }
    if (sec.transcriptionLink) {
      await insertExternalAsset(client, sectionId, "transcript", sec.transcriptionLink);
    }
  }

  return classId;
}

/** Create multiple classes in spreadsheet order, appended after existing course classes. */
export async function bulkCreateClassesInCourseInDb(
  payload: BulkImportPayload,
): Promise<BulkCreateResult> {
  const pool = getPgPool();
  const client = await pool.connect();
  const sorted = payload.classes.slice().sort((a, b) => a.order - b.order);

  try {
    await client.query("BEGIN");
    await assertCourseExists(client, payload.courseId);

    const maxRes = await client.query<{ max: number | null }>(
      `SELECT COALESCE(MAX(position), -1) AS max FROM classes WHERE course_id = $1`,
      [payload.courseId],
    );
    const basePosition = (maxRes.rows[0]?.max ?? -1) + 1;

    const created: BulkCreateResult["created"] = [];
    const allTopics = new Set<string>();

    for (let i = 0; i < sorted.length; i++) {
      const cls = sorted[i];
      const classId = await insertClassWithSections(
        client,
        payload.courseId,
        cls,
        basePosition + i,
      );
      for (const t of cls.topics) allTopics.add(t);
      created.push({ classId, name: cls.name, order: cls.order });
    }

    if (allTopics.size) {
      const topicsRes = await client.query<{ topics: string[] | null }>(
        `SELECT topics FROM courses WHERE id = $1`,
        [payload.courseId],
      );
      const merged = Array.from(new Set([...(topicsRes.rows[0]?.topics ?? []), ...allTopics]));
      await client.query(`UPDATE courses SET topics = $2, updated_at = now() WHERE id = $1`, [
        payload.courseId,
        merged,
      ]);
    } else {
      await client.query(`UPDATE courses SET updated_at = now() WHERE id = $1`, [payload.courseId]);
    }

    await client.query("COMMIT");
    return { courseId: payload.courseId, created };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
