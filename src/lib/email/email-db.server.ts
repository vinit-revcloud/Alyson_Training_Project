import { getPgPool } from "@/lib/pg.server";

export interface EmailTemplateRow {
  key: string;
  subject: string;
  body_md: string;
  audience: string;
}

export interface EmailSendStateRow {
  retry_after_until: string | null;
  batch_size: number;
  send_delay_ms: number;
  auth_email_ttl_minutes: number;
  transactional_email_ttl_minutes: number;
}

export interface EmailQueueMessage {
  msg_id: number;
  read_ct: number;
  enqueued_at: string;
  message: Record<string, unknown>;
}

export async function getEmailTemplate(key: string): Promise<EmailTemplateRow | null> {
  const pool = getPgPool();
  const { rows } = await pool.query<EmailTemplateRow>(
    `SELECT key, subject, body_md, audience FROM email_templates WHERE key = $1 LIMIT 1`,
    [key],
  );
  return rows[0] ?? null;
}

export async function getProfileEmail(userId: string): Promise<string | null> {
  const pool = getPgPool();
  const { rows } = await pool.query<{ email: string | null }>(
    `SELECT email FROM profiles WHERE user_id = $1 LIMIT 1`,
    [userId],
  );
  return rows[0]?.email ?? null;
}

export async function findNotificationLogByIdempotency(
  idempotencyKey: string,
): Promise<{ id: string } | null> {
  const pool = getPgPool();
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM notification_log WHERE idempotency_key = $1 LIMIT 1`,
    [idempotencyKey],
  );
  return rows[0] ?? null;
}

export async function insertNotificationLog(input: {
  user_id?: string | null;
  assignment_id?: string | null;
  template_key: string;
  audience: string;
  recipient_email: string;
  subject: string;
  status: string;
  idempotency_key: string;
}): Promise<string> {
  const pool = getPgPool();
  const { rows } = await pool.query<{ id: string }>(
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

export async function updateNotificationLog(
  id: string,
  patch: {
    status?: string;
    error?: string | null;
    provider_message_id?: string | null;
    sent_at?: string | null;
  },
): Promise<void> {
  const pool = getPgPool();
  await pool.query(
    `UPDATE notification_log
     SET status = COALESCE($2, status),
         error = COALESCE($3, error),
         provider_message_id = COALESCE($4, provider_message_id),
         sent_at = COALESCE($5, sent_at)
     WHERE id = $1`,
    [
      id,
      patch.status ?? null,
      patch.error ?? null,
      patch.provider_message_id ?? null,
      patch.sent_at ?? null,
    ],
  );
}

export async function updateNotificationLogByIdempotency(
  idempotencyKey: string,
  patch: {
    status: string;
    provider_message_id?: string | null;
    sent_at?: string | null;
    error?: string | null;
  },
): Promise<void> {
  const pool = getPgPool();
  await pool.query(
    `UPDATE notification_log
     SET status = $2,
         provider_message_id = COALESCE($3, provider_message_id),
         sent_at = COALESCE($4, sent_at),
         error = COALESCE($5, error)
     WHERE idempotency_key = $1`,
    [
      idempotencyKey,
      patch.status,
      patch.provider_message_id ?? null,
      patch.sent_at ?? null,
      patch.error ?? null,
    ],
  );
}

export async function enqueueEmail(
  queueName: string,
  payload: Record<string, unknown>,
): Promise<number> {
  const pool = getPgPool();
  const { rows } = await pool.query<{ id: string }>(
    `SELECT enqueue_email($1, $2::jsonb) AS id`,
    [queueName, JSON.stringify(payload)],
  );
  return Number(rows[0]?.id ?? 0);
}

export async function readEmailBatch(
  queueName: string,
  batchSize: number,
  vt: number,
): Promise<EmailQueueMessage[]> {
  const pool = getPgPool();
  const { rows } = await pool.query<EmailQueueMessage>(
    `SELECT msg_id, read_ct, enqueued_at, message
     FROM read_email_batch($1, $2, $3)`,
    [queueName, batchSize, vt],
  );
  return rows.map((r) => ({
    msg_id: Number(r.msg_id),
    read_ct: Number(r.read_ct),
    enqueued_at: r.enqueued_at,
    message: r.message as Record<string, unknown>,
  }));
}

export async function deleteEmailFromQueue(queueName: string, messageId: number): Promise<void> {
  const pool = getPgPool();
  await pool.query(`SELECT delete_email($1, $2)`, [queueName, messageId]);
}

export async function moveEmailToDlq(
  sourceQueue: string,
  dlqName: string,
  messageId: number,
  payload: Record<string, unknown>,
): Promise<void> {
  const pool = getPgPool();
  await pool.query(`SELECT move_to_dlq($1, $2, $3, $4::jsonb)`, [
    sourceQueue,
    dlqName,
    messageId,
    JSON.stringify(payload),
  ]);
}

export async function getEmailSendState(): Promise<EmailSendStateRow | null> {
  const pool = getPgPool();
  const { rows } = await pool.query<EmailSendStateRow>(
    `SELECT retry_after_until, batch_size, send_delay_ms, auth_email_ttl_minutes, transactional_email_ttl_minutes
     FROM email_send_state WHERE id = 1`,
  );
  return rows[0] ?? null;
}

export async function setEmailRetryAfter(untilIso: string): Promise<void> {
  const pool = getPgPool();
  await pool.query(
    `UPDATE email_send_state SET retry_after_until = $1, updated_at = now() WHERE id = 1`,
    [untilIso],
  );
}

export async function touchEmailSendState(): Promise<void> {
  const pool = getPgPool();
  await pool.query(`UPDATE email_send_state SET updated_at = now() WHERE id = 1`);
}

export async function isEmailSuppressed(email: string): Promise<boolean> {
  const pool = getPgPool();
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM suppressed_emails WHERE lower(email) = lower($1) LIMIT 1`,
    [email],
  );
  return rows.length > 0;
}

export async function insertEmailSendLog(input: {
  message_id?: string | null;
  template_name: string;
  recipient_email: string;
  status: string;
  error_message?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  const pool = getPgPool();
  await pool.query(
    `INSERT INTO email_send_log (message_id, template_name, recipient_email, status, error_message, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      input.message_id ?? null,
      input.template_name,
      input.recipient_email,
      input.status,
      input.error_message ?? null,
      input.metadata ? JSON.stringify(input.metadata) : null,
    ],
  );
}

export async function countFailedSendLogs(messageIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (!messageIds.length) return counts;
  const pool = getPgPool();
  const { rows } = await pool.query<{ message_id: string }>(
    `SELECT message_id FROM email_send_log
     WHERE message_id = ANY($1::text[]) AND status = 'failed'`,
    [messageIds],
  );
  for (const row of rows) {
    counts.set(row.message_id, (counts.get(row.message_id) ?? 0) + 1);
  }
  return counts;
}

export async function hasSentEmailLog(messageId: string): Promise<boolean> {
  const pool = getPgPool();
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM email_send_log WHERE message_id = $1 AND status = 'sent' LIMIT 1`,
    [messageId],
  );
  return rows.length > 0;
}
