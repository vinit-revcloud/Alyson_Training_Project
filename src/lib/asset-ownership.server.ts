import { getPgPool } from "@/lib/pg.server";
import { parseClassSectionFromPath } from "@/lib/asset-upload-limits";
import type { AssetBucket } from "@/lib/asset-storage.shared";
import { userHasContentManagerRole, userHasHiringReadAccess } from "@/lib/content-manager.server";
import { assertLearnerCourseAccess } from "@/lib/learn-access.server";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Ensure upload path references an existing section under a class. */
export async function assertSectionExistsForUpload(storagePath: string): Promise<void> {
  const parsed = parseClassSectionFromPath(storagePath);
  if (!parsed) throw new Error("Invalid storage path");

  const pool = getPgPool();
  const { rows } = await pool.query<{ id: string }>(
    `SELECT s.id FROM sections s
     JOIN classes c ON c.id = s.class_id
     WHERE s.id = $1 AND c.id = $2
     LIMIT 1`,
    [parsed.sectionId, parsed.classId],
  );
  if (!rows[0]?.id) throw new Error("Section not found for upload path");
}

/** Interview paper uploads use `{sessionId}/{filename}` paths. */
export async function assertInterviewPaperUploadPath(storagePath: string): Promise<void> {
  const sessionId = storagePath.split("/").filter(Boolean)[0];
  if (!sessionId || !UUID.test(sessionId)) throw new Error("Invalid storage path");

  const pool = getPgPool();
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM interview_sessions WHERE id = $1 LIMIT 1`,
    [sessionId],
  );
  if (!rows[0]?.id) throw new Error("Interview session not found for upload path");
}

/** Gate signed URL generation — content managers may read any asset; learners only enrolled content. */
export async function assertAssetReadAccess(
  userId: string,
  bucket: AssetBucket,
  storagePath: string,
): Promise<void> {
  if (await userHasContentManagerRole(userId)) return;

  const pool = getPgPool();

  if (bucket === "interview-papers") {
    if (!(await userHasHiringReadAccess(userId))) {
      throw new Error("You do not have access to this asset");
    }
    const sessionId = storagePath.split("/").filter(Boolean)[0];
    if (!sessionId || !UUID.test(sessionId)) {
      throw new Error("You do not have access to this asset");
    }
    const { rows } = await pool.query<{ ok: boolean }>(
      `SELECT true AS ok FROM interview_sessions s
       WHERE s.id = $1
         AND EXISTS (
           SELECT 1 FROM jsonb_array_elements(COALESCE(s.paper_assessment->'uploads', '[]'::jsonb)) u
           WHERE u->>'storage_path' = $2
         )
       LIMIT 1`,
      [sessionId, storagePath],
    );
    if (!rows[0]?.ok) throw new Error("You do not have access to this asset");
    return;
  }

  if (bucket === "class-documents" && storagePath.startsWith("policies/")) {
    const { rows } = await pool.query<{ id: string }>(
      `SELECT id FROM policy_documents
       WHERE storage_bucket = $1 AND storage_path = $2 AND status = 'published'
       LIMIT 1`,
      [bucket, storagePath],
    );
    if (!rows[0]?.id) throw new Error("You do not have access to this asset");
    return;
  }

  const parsed = parseClassSectionFromPath(storagePath);
  if (!parsed) throw new Error("You do not have access to this asset");

  const { rows } = await pool.query<{ course_id: string }>(
    `SELECT c.course_id
     FROM section_assets sa
     JOIN sections s ON s.id = sa.section_id
     JOIN classes c ON c.id = s.class_id
     WHERE sa.storage_bucket = $1
       AND sa.storage_path = $2
       AND s.id = $3
       AND c.id = $4
     LIMIT 1`,
    [bucket, storagePath, parsed.sectionId, parsed.classId],
  );
  if (!rows[0]?.course_id) throw new Error("You do not have access to this asset");

  await assertLearnerCourseAccess(userId, rows[0].course_id);
}
