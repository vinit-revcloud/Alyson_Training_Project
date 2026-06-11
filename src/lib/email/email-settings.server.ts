import { getPgPool } from "@/lib/pg.server";

export type EmailJobKey =
  | "assignment_new"
  | "reminder_daily"
  | "escalation"
  | "failure_retake"
  | "test_completed"
  | "weekly_ceo_summary";

export interface EmailWorkspaceSettings {
  notifyOnFailure: boolean;
  weeklyCeoSummary: boolean;
  retakeDeadlineAlert: boolean;
  reminderDueWithinDays: number;
}

const DEFAULTS: EmailWorkspaceSettings = {
  notifyOnFailure: true,
  weeklyCeoSummary: false,
  retakeDeadlineAlert: true,
  reminderDueWithinDays: 1,
};

export async function isEmailJobEnabled(jobKey: EmailJobKey): Promise<boolean> {
  const pool = getPgPool();
  const { rows } = await pool.query<{ enabled: boolean }>(
    `SELECT enabled FROM notification_schedules WHERE job_key = $1`,
    [jobKey],
  );
  return rows[0]?.enabled ?? true;
}

export async function getEmailWorkspaceSettings(): Promise<EmailWorkspaceSettings> {
  const pool = getPgPool();
  const { rows } = await pool.query<{ job_key: string; enabled: boolean; config: Record<string, unknown> }>(
    `SELECT job_key, enabled, config FROM notification_schedules
     WHERE job_key IN ('failure_retake', 'weekly_ceo_summary', 'reminder_daily')`,
  );

  const byKey = new Map(rows.map((r) => [r.job_key, r]));
  const failure = byKey.get("failure_retake");
  const weekly = byKey.get("weekly_ceo_summary");
  const reminder = byKey.get("reminder_daily");

  return {
    notifyOnFailure: failure?.enabled ?? DEFAULTS.notifyOnFailure,
    weeklyCeoSummary: weekly?.enabled ?? DEFAULTS.weeklyCeoSummary,
    retakeDeadlineAlert: reminder?.enabled ?? DEFAULTS.retakeDeadlineAlert,
    reminderDueWithinDays:
      typeof reminder?.config?.only_when_due_within_days === "number"
        ? reminder.config.only_when_due_within_days
        : DEFAULTS.reminderDueWithinDays,
  };
}

export async function saveEmailWorkspaceSettings(input: EmailWorkspaceSettings): Promise<void> {
  const pool = getPgPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE notification_schedules SET enabled = $1, updated_at = now() WHERE job_key = 'failure_retake'`,
      [input.notifyOnFailure],
    );
    await client.query(
      `INSERT INTO notification_schedules (job_key, label, enabled, cron_expression, config)
       VALUES ('weekly_ceo_summary', 'Weekly CEO progress summary', $1, '0 9 * * 1', '{}'::jsonb)
       ON CONFLICT (job_key) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now()`,
      [input.weeklyCeoSummary],
    );
    await client.query(
      `UPDATE notification_schedules
       SET enabled = $2,
           config = COALESCE(config, '{}'::jsonb) || jsonb_build_object('only_when_due_within_days', $3::int),
           updated_at = now()
       WHERE job_key = 'reminder_daily'`,
      [input.retakeDeadlineAlert, input.reminderDueWithinDays],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
