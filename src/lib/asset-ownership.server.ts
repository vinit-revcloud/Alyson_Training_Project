import { getPgPool } from "@/lib/pg.server";
import { parseClassSectionFromPath } from "@/lib/asset-upload-limits";

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
