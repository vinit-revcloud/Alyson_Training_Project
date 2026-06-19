import pg from "pg";

const { Pool } = pg;

let pool;

function getPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not configured");
    }
    pool = new Pool({ connectionString, max: 2 });
  }
  return pool;
}

export async function archiveQueueMessage(queueId) {
  const queueName = process.env.QUEUE_NAME || "transactional_emails";
  await getPool().query(`SELECT delete_email($1, $2)`, [queueName, queueId]);
}

export async function getAssignmentStatus(assignmentId, userId) {
  const { rows } = await getPool().query(
    `SELECT status, attempts_used, max_attempts
     FROM assessment_assignments
     WHERE id = $1 AND learner_user_id = $2
     LIMIT 1`,
    [assignmentId, userId],
  );
  return rows[0] ?? null;
}

export async function findNotificationLogByIdempotency(idempotencyKey) {
  const { rows } = await getPool().query(
    `SELECT id, status FROM notification_log WHERE idempotency_key = $1 LIMIT 1`,
    [idempotencyKey],
  );
  return rows[0] ?? null;
}

export async function getEmailTemplate(key) {
  const { rows } = await getPool().query(
    `SELECT key, subject, body_md, audience FROM email_templates WHERE key = $1 LIMIT 1`,
    [key],
  );
  return rows[0] ?? null;
}

export async function insertNotificationLog(input) {
  const { rows } = await getPool().query(
    `INSERT INTO notification_log (
       user_id, assignment_id, template_key, audience, recipient_email, subject, status, idempotency_key
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      input.user_id ?? null,
      input.assignment_id ?? null,
      input.template_key,
      input.audience,
      input.recipient_email,
      input.subject,
      input.status,
      input.idempotency_key,
    ],
  );
  return rows[0].id;
}

export async function getAdminRecipientEmails() {
  const { rows } = await getPool().query(
    `SELECT DISTINCT p.email
     FROM profiles p
     JOIN user_roles ur ON ur.user_id = p.user_id
     WHERE ur.role = ANY($1::text[])
       AND p.email IS NOT NULL
       AND p.email <> ''`,
    [process.env.ADMIN_ESCALATION_ROLES?.split(",") ?? ["admin", "ceo", "hiring_manager"]],
  );
  return rows.map((r) => r.email).filter(Boolean);
}
