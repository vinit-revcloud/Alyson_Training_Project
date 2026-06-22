import { getAppBaseUrl } from "@/lib/config.server";
import { getPgPool } from "@/lib/pg.server";
import {
  enqueueEmail,
  findNotificationLogByIdempotency,
  getEmailTemplate,
  insertNotificationLog,
} from "@/lib/email/email-db.server";
import { substitute, type PlaceholderKey } from "@/lib/email/render";

const QUEUE = "transactional_emails";

async function enqueueTemplateEmail(input: {
  templateKey: string;
  toEmail: string;
  userId?: string;
  placeholders: Partial<Record<PlaceholderKey, string>>;
  idempotencyKey: string;
  audience?: string;
}): Promise<boolean> {
  const existing = await findNotificationLogByIdempotency(input.idempotencyKey);
  if (existing) return false;

  const tpl = await getEmailTemplate(input.templateKey);
  if (!tpl) return false;

  const subject = substitute(tpl.subject, input.placeholders);
  const html = substitute(tpl.body_md, input.placeholders);

  const logId = await insertNotificationLog({
    user_id: input.userId,
    template_key: input.templateKey,
    audience: input.audience ?? tpl.audience,
    recipient_email: input.toEmail,
    subject,
    status: "queued",
    idempotency_key: input.idempotencyKey,
  });

  await enqueueEmail(QUEUE, {
    to: input.toEmail,
    subject,
    html,
    label: input.templateKey,
    notification_log_id: logId,
    idempotency_key: input.idempotencyKey,
    queued_at: new Date().toISOString(),
  });
  return true;
}

export async function notifyTrialSubmitted(
  pipelineId: string,
  candidateName: string,
): Promise<void> {
  const pool = getPgPool();
  const base = getAppBaseUrl().replace(/\/$/, "");
  const { rows } = await pool.query<{ email: string }>(
    `SELECT DISTINCT p.email
     FROM profiles p
     JOIN user_roles ur ON ur.user_id = p.user_id
     WHERE ur.role IN ('admin', 'hiring_manager', 'trainer')
       AND p.email IS NOT NULL`,
  );
  for (const hr of rows) {
    if (!hr.email) continue;
    await enqueueTemplateEmail({
      templateKey: "trial_submitted",
      toEmail: hr.email,
      audience: "admin",
      placeholders: {
        learner_name: candidateName,
        assignment_name: "Trial project",
        retake_link: `${base}/hiring/pipeline/${pipelineId}`,
      },
      idempotencyKey: `trial_submitted:${pipelineId}:${hr.email}`,
    });
  }
}

export async function notifyPolicyAckRequired(userId: string): Promise<void> {
  const pool = getPgPool();
  const { rows } = await pool.query<{ email: string; display_name: string | null }>(
    `SELECT email, display_name FROM profiles WHERE user_id = $1`,
    [userId],
  );
  const profile = rows[0];
  if (!profile?.email) return;

  const pending = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM policy_documents p
     WHERE p.status = 'published' AND p.requires_acknowledgement = true
       AND NOT EXISTS (
         SELECT 1 FROM policy_acknowledgements a
         WHERE a.policy_document_id = p.id AND a.user_id = $1
           AND a.policy_version >= p.version
       )`,
    [userId],
  );
  if (Number(pending.rows[0]?.count ?? 0) === 0) return;

  const base = getAppBaseUrl().replace(/\/$/, "");
  await enqueueTemplateEmail({
    templateKey: "policy_ack_required",
    toEmail: profile.email,
    userId,
    placeholders: {
      learner_name: profile.display_name ?? "there",
      retake_link: `${base}/learn/policies`,
    },
    idempotencyKey: `policy_ack:${userId}`,
  });
}

export async function runTrialDueReminders(): Promise<{ queued: number }> {
  const pool = getPgPool();
  const base = getAppBaseUrl().replace(/\/$/, "");
  const { rows } = await pool.query<{
    pipeline_id: string;
    title: string;
    due_at: string;
    candidate_name: string;
    email: string | null;
  }>(
    `SELECT p.id AS pipeline_id, t.title, t.due_at, c.name AS candidate_name, pr.email
     FROM trial_projects t
     JOIN hiring_pipelines p ON p.id = t.pipeline_id
     JOIN candidates c ON c.id = p.candidate_id
     LEFT JOIN profiles pr ON pr.user_id = p.user_id
     WHERE t.submitted_at IS NULL
       AND t.due_at IS NOT NULL
       AND t.due_at <= now() + interval '48 hours'
       AND t.due_at > now()`,
  );
  let queued = 0;
  for (const row of rows) {
    const emails = new Set<string>();
    if (row.email) emails.add(row.email);
    const { rows: hrRows } = await pool.query<{ email: string }>(
      `SELECT DISTINCT p.email FROM profiles p
       JOIN user_roles ur ON ur.user_id = p.user_id
       WHERE ur.role IN ('admin', 'hiring_manager') AND p.email IS NOT NULL`,
    );
    for (const hr of hrRows) emails.add(hr.email);

    for (const to of emails) {
      const sent = await enqueueTemplateEmail({
        templateKey: "trial_due_soon",
        toEmail: to,
        audience: "admin",
        placeholders: {
          learner_name: row.candidate_name,
          assignment_name: row.title,
          due_date: new Date(row.due_at).toLocaleString(),
          retake_link: `${base}/hiring/pipeline/${row.pipeline_id}`,
        },
        idempotencyKey: `trial_due:${row.pipeline_id}:${to}:${row.due_at.slice(0, 10)}`,
      });
      if (sent) queued++;
    }
  }
  return { queued };
}

export async function runOnboardingStallReminders(): Promise<{ queued: number }> {
  const pool = getPgPool();
  const base = getAppBaseUrl().replace(/\/$/, "");
  const { rows } = await pool.query<{ user_id: string; email: string; display_name: string }>(
    `SELECT p.user_id, p.email, p.display_name
     FROM onboarding_enrollments oe
     JOIN profiles p ON p.user_id = oe.user_id
     JOIN hiring_pipelines hp ON hp.id = oe.pipeline_id AND hp.status = 'active'
     WHERE NOT EXISTS (
       SELECT 1 FROM learner_item_progress lip
       WHERE lip.user_id = oe.user_id
         AND lip.last_visited_at >= now() - interval '7 days'
     )
       AND p.email IS NOT NULL`,
  );
  let queued = 0;
  const today = new Date().toISOString().slice(0, 10);
  for (const row of rows) {
    const sent = await enqueueTemplateEmail({
      templateKey: "onboarding_stalled",
      toEmail: row.email,
      userId: row.user_id,
      placeholders: {
        learner_name: row.display_name ?? "there",
        retake_link: `${base}/learn/dashboard`,
      },
      idempotencyKey: `onboarding_stall:${row.user_id}:${today}`,
    });
    if (sent) queued++;
  }
  return { queued };
}

export async function runOnboardingEmailJobs(): Promise<{ queued: number }> {
  const trial = await runTrialDueReminders();
  const stall = await runOnboardingStallReminders();
  return { queued: trial.queued + stall.queued };
}
