import { getPgPool } from "@/lib/pg.server";
import type { EmailLogRow, EmailMetrics } from "@/lib/notifications-api";

export async function fetchEmailMetricsFromDb(): Promise<EmailMetrics> {
  const pool = getPgPool();
  const { rows } = await pool.query<{
    id: string;
    recipient_email: string;
    subject: string;
    template_key: string;
    audience: string;
    status: string;
    sent_at: string | null;
    created_at: string;
    provider_message_id: string | null;
    error: string | null;
  }>(
    `SELECT id, recipient_email, subject, template_key, audience, status,
            sent_at, created_at, provider_message_id, error
     FROM notification_log
     ORDER BY created_at DESC
     LIMIT 500`,
  );

  const mapped: EmailLogRow[] = rows.map((r) => ({
    id: r.id,
    recipient_email: r.recipient_email,
    subject: r.subject,
    kind: r.template_key,
    audience: r.audience,
    status: r.status as EmailLogRow["status"],
    sent_at: r.sent_at,
    created_at: r.created_at,
    provider_message_id: r.provider_message_id,
    error_message: r.error,
  }));

  let sent = 0;
  let pending = 0;
  let failed = 0;
  let bounced = 0;
  for (const r of mapped) {
    if (r.status === "sent") sent += 1;
    else if (r.status === "pending" || r.status === "queued") pending += 1;
    else if (r.status === "failed" || r.status === "suppressed") failed += 1;
    else if (r.status === "bounced" || r.status === "complained") bounced += 1;
  }

  const escalations = mapped.filter(
    (r) =>
      r.kind.startsWith("escalation") ||
      r.kind === "weekly_ceo_summary" ||
      r.audience === "hr" ||
      r.audience === "ceo" ||
      r.audience === "admin",
  );

  return {
    total: mapped.length,
    sent,
    pending,
    failed,
    bounced,
    recent: mapped.slice(0, 50),
    escalations: escalations.slice(0, 20),
  };
}

export interface EmailHealthSummary {
  queueDepth: number;
  suppressedCount: number;
  lastProcessed: string | null;
}

export async function fetchEmailHealthSummary(): Promise<EmailHealthSummary> {
  const pool = getPgPool();
  const [queueRes, suppressedRes, stateRes] = await Promise.all([
    pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM email_queue WHERE archived_at IS NULL`,
    ),
    pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM suppressed_emails`),
    pool.query<{ updated_at: string }>(
      `SELECT updated_at FROM email_send_state WHERE id = 1`,
    ),
  ]);
  return {
    queueDepth: queueRes.rows[0]?.n ?? 0,
    suppressedCount: suppressedRes.rows[0]?.n ?? 0,
    lastProcessed: stateRes.rows[0]?.updated_at ?? null,
  };
}
