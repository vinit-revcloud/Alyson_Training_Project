import { getPgPool } from "@/lib/pg.server";
import { uploadAssetFile } from "@/lib/asset-storage.server";
import { randomUUID } from "node:crypto";

export interface AdminPolicyRow {
  id: string;
  slug: string;
  title: string;
  summary: string;
  content: string;
  version: number;
  requires_acknowledgement: boolean;
  status: string;
  sort_order: number;
  storage_bucket: string | null;
  storage_path: string | null;
  published_at: string | null;
}

export async function listAdminPoliciesFromDb(): Promise<AdminPolicyRow[]> {
  const pool = getPgPool();
  const { rows } = await pool.query<AdminPolicyRow>(
    `SELECT id, slug, title, summary, content, version, requires_acknowledgement,
            status, sort_order, storage_bucket, storage_path, published_at
     FROM policy_documents
     ORDER BY sort_order ASC, title ASC`,
  );
  return rows;
}

export async function upsertPolicyInDb(input: {
  id?: string;
  slug: string;
  title: string;
  summary: string;
  content: string;
  requiresAcknowledgement: boolean;
  status: "draft" | "published" | "archived";
  sortOrder: number;
}): Promise<string> {
  const pool = getPgPool();
  if (input.id) {
    await pool.query(
      `UPDATE policy_documents SET
         slug = $2, title = $3, summary = $4, content = $5,
         requires_acknowledgement = $6, status = $7, sort_order = $8,
         published_at = CASE WHEN $7 = 'published' THEN COALESCE(published_at, now()) ELSE published_at END
       WHERE id = $1`,
      [
        input.id,
        input.slug,
        input.title,
        input.summary,
        input.content,
        input.requiresAcknowledgement,
        input.status,
        input.sortOrder,
      ],
    );
    return input.id;
  }
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO policy_documents (
       slug, title, summary, content, requires_acknowledgement, status, sort_order, published_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7,
       CASE WHEN $6 = 'published' THEN now() ELSE NULL END)
     RETURNING id`,
    [
      input.slug,
      input.title,
      input.summary,
      input.content,
      input.requiresAcknowledgement,
      input.status,
      input.sortOrder,
    ],
  );
  return rows[0]!.id;
}

export async function uploadPolicyPdfInDb(input: {
  policyId: string;
  fileName: string;
  data: Buffer;
}): Promise<{ storagePath: string }> {
  const pool = getPgPool();
  const slugRes = await pool.query<{ slug: string; version: number }>(
    `SELECT slug, version FROM policy_documents WHERE id = $1`,
    [input.policyId],
  );
  const row = slugRes.rows[0];
  if (!row) throw new Error("Policy not found");

  const ext = input.fileName.includes(".") ? input.fileName.split(".").pop() : "pdf";
  const storagePath = `policies/${row.slug}/v${row.version + 1}-${randomUUID().slice(0, 8)}.${ext}`;
  await uploadAssetFile("class-documents", storagePath, input.data);

  await pool.query(
    `UPDATE policy_documents SET
       storage_bucket = 'class-documents',
       storage_path = $2,
       version = version + 1,
       updated_at = now()
     WHERE id = $1`,
    [input.policyId, storagePath],
  );
  return { storagePath };
}

export async function publishPolicyInDb(policyId: string): Promise<void> {
  const pool = getPgPool();
  await pool.query(
    `UPDATE policy_documents SET status = 'published', published_at = COALESCE(published_at, now())
     WHERE id = $1`,
    [policyId],
  );
}
