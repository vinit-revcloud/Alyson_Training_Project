import { getPgPool } from "@/lib/pg.server";

export interface PolicyDocumentRow {
  id: string;
  slug: string;
  title: string;
  summary: string;
  content: string;
  version: number;
  requires_acknowledgement: boolean;
  acknowledged_at: string | null;
  acknowledged_version: number | null;
  storage_bucket: string | null;
  storage_path: string | null;
}

export async function listPoliciesForUserFromDb(userId: string): Promise<PolicyDocumentRow[]> {
  const pool = getPgPool();
  const { rows } = await pool.query<PolicyDocumentRow>(
    `SELECT p.id, p.slug, p.title, p.summary, p.content, p.version, p.requires_acknowledgement,
            p.storage_bucket, p.storage_path,
            a.acknowledged_at, a.policy_version AS acknowledged_version
     FROM policy_documents p
     LEFT JOIN policy_acknowledgements a
       ON a.policy_document_id = p.id AND a.user_id = $1
     WHERE p.status = 'published'
     ORDER BY p.sort_order ASC, p.title ASC`,
    [userId],
  );
  return rows;
}

export async function acknowledgePolicyInDb(input: {
  userId: string;
  policyId: string;
}): Promise<void> {
  const pool = getPgPool();
  const doc = await pool.query<{ version: number; requires_acknowledgement: boolean }>(
    `SELECT version, requires_acknowledgement FROM policy_documents
     WHERE id = $1 AND status = 'published'`,
    [input.policyId],
  );
  const row = doc.rows[0];
  if (!row) throw new Error("Policy not found");
  if (!row.requires_acknowledgement) throw new Error("This policy does not require acknowledgement");

  await pool.query(
    `INSERT INTO policy_acknowledgements (user_id, policy_document_id, policy_version)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, policy_document_id) DO UPDATE SET
       policy_version = EXCLUDED.policy_version,
       acknowledged_at = now()`,
    [input.userId, input.policyId, row.version],
  );
}

export async function countPendingPoliciesForUser(userId: string): Promise<number> {
  const pool = getPgPool();
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM policy_documents p
     WHERE p.status = 'published'
       AND p.requires_acknowledgement = true
       AND NOT EXISTS (
         SELECT 1 FROM policy_acknowledgements a
         WHERE a.policy_document_id = p.id
           AND a.user_id = $1
           AND a.policy_version >= p.version
       )`,
    [userId],
  );
  return Number(rows[0]?.count ?? 0);
}
