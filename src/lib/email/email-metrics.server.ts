import { getPgPool } from "@/lib/pg.server";
import type { EmailLogRow, EmailMetrics } from "@/lib/notifications-api";

function mapLogRow(r: {
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
}): EmailLogRow {
  return {
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
  };
}

export async function fetchEmailMetricsFromDb(): Promise<EmailMetrics> {
  const pool = getPgPool();

  const [
    statusCountsRes,
    sendLogCountsRes,
    workflowRes,
    recentRes,
    escalationRes,
  ] = await Promise.all([
    pool.query<{ status: string; n: number }>(
      `SELECT status, count(*)::int AS n FROM notification_log GROUP BY status`,
    ),
    pool.query<{ status: string; n: number }>(
      `SELECT status, count(*)::int AS n
       FROM email_send_log
       WHERE status IN ('sent', 'failed', 'suppressed', 'bounced', 'complained', 'pending')
       GROUP BY status`,
    ),
    pool.query<{
      learners_at_risk: number;
      retake_eligible: number;
      escalations_sent: number;
    }>(
      `SELECT
         (SELECT count(*)::int FROM assessment_assignments
          WHERE status IN ('assigned', 'in_progress') AND due_at < now()) AS learners_at_risk,
         (SELECT count(*)::int FROM assessment_assignments
          WHERE status = 'assigned' AND attempts_used > 0 AND attempts_used < max_attempts) AS retake_eligible,
         (SELECT count(*)::int FROM notification_log
          WHERE template_key = 'escalation_day30' AND status = 'sent') AS escalations_sent`,
    ),
    pool.query<{
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
       LIMIT 100`,
    ),
    pool.query<{
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
       WHERE template_key LIKE 'escalation%'
          OR template_key = 'weekly_ceo_summary'
          OR audience IN ('hr', 'ceo', 'admin')
       ORDER BY created_at DESC
       LIMIT 30`,
    ),
  ]);

  const statusCounts = new Map(statusCountsRes.rows.map((r) => [r.status, r.n]));
  const sendLogCounts = new Map(sendLogCountsRes.rows.map((r) => [r.status, r.n]));

  const sent = statusCounts.get("sent") ?? 0;
  const pending = (statusCounts.get("pending") ?? 0) + (statusCounts.get("queued") ?? 0);
  const failed =
    (statusCounts.get("failed") ?? 0) +
    (statusCounts.get("suppressed") ?? 0) +
    (sendLogCounts.get("failed") ?? 0);
  const bounced =
    (statusCounts.get("bounced") ?? 0) +
    (statusCounts.get("complained") ?? 0) +
    (sendLogCounts.get("bounced") ?? 0) +
    (sendLogCounts.get("complained") ?? 0);

  const total = [...statusCounts.values()].reduce((sum, n) => sum + n, 0);

  const recent = recentRes.rows.map(mapLogRow);
  const escalations = escalationRes.rows.map(mapLogRow);

  const workflow = workflowRes.rows[0];

  return {
    total,
    sent,
    pending,
    failed,
    bounced,
    sendLogSent: sendLogCounts.get("sent") ?? 0,
    learnersAtRisk: workflow?.learners_at_risk ?? 0,
    retakeEligible: workflow?.retake_eligible ?? 0,
    escalationsSent: workflow?.escalations_sent ?? 0,
    recent: recent.slice(0, 50),
    escalations: escalations.slice(0, 20),
  };
}

export interface EmailHealthSummary {
  queueDepth: number;
  suppressedCount: number;
  /** Last SES-confirmed send (notification_log.sent_at). */
  lastProcessed: string | null;
}

export async function fetchEmailHealthSummary(): Promise<EmailHealthSummary> {
  const pool = getPgPool();
  const [queueRes, suppressedRes, lastSentRes] = await Promise.all([
    pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM email_queue WHERE archived_at IS NULL`,
    ),
    pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM suppressed_emails`),
    pool.query<{ last_sent: string | null }>(
      `SELECT max(sent_at) AS last_sent FROM notification_log WHERE status = 'sent'`,
    ),
  ]);
  return {
    queueDepth: queueRes.rows[0]?.n ?? 0,
    suppressedCount: suppressedRes.rows[0]?.n ?? 0,
    lastProcessed: lastSentRes.rows[0]?.last_sent ?? null,
  };
}
