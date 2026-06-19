import { getAppBaseUrl } from "@/lib/config.server";
import { getPgPool } from "@/lib/pg.server";
import {
  enqueueEmail,
  findNotificationLogByIdempotency,
  findPendingQueueByAssignmentAndType,
  getEmailTemplate,
  getProfileEmail,
  insertNotificationLog,
  updateNotificationLog,
} from "@/lib/email/email-db.server";
import { substitute, type PlaceholderKey } from "@/lib/email/render";
import {
  type AssignmentEmailType,
  type EnqueueAssignmentEmailResult,
} from "@/lib/email/enqueue-assignment-email.shared";
import { triggerEmailWorkflow } from "@/lib/email/trigger-email-workflow.server";

export type { AssignmentEmailType, EnqueueAssignmentEmailResult };

const TEMPLATE_KEY_BY_EMAIL_TYPE: Record<AssignmentEmailType, string> = {
  initial: "assignment_new",
  reminder_day7: "escalation_day7",
  reminder_day14: "escalation_day14",
  retake: "failure_retake",
  escalation_day30: "escalation_day30",
};

const SES_TEMPLATE_BY_EMAIL_TYPE: Record<AssignmentEmailType, string> = {
  initial: "assignment_email",
  reminder_day7: "reminder_day7",
  reminder_day14: "reminder_day14",
  retake: "retake_reminder",
  escalation_day30: "escalation_day30",
};

const QUEUE_NAME = "transactional_emails";

export type AssignmentEmailPlaceholders = Partial<Record<PlaceholderKey, string>>;

export interface EnqueueAssignmentEmailInput {
  user_id: string;
  assignment_id: string;
  email_type: AssignmentEmailType;
  placeholders?: AssignmentEmailPlaceholders;
}

function buildRetakeLink(assignmentId: string): string {
  const base = getAppBaseUrl().replace(/\/$/, "");
  return `${base}/attempt/${assignmentId}`;
}

async function loadPlaceholdersFromDb(
  assignmentId: string,
  userId: string,
): Promise<AssignmentEmailPlaceholders | null> {
  const pool = getPgPool();
  const { rows } = await pool.query<{
    learner_user_id: string;
    assessment_id: string;
    course_id: string | null;
    due_at: string | null;
    last_attempt_id: string | null;
    assessment_title: string | null;
    course_title: string | null;
    display_name: string | null;
    attempt_score: string | null;
  }>(
    `SELECT
       aa.learner_user_id,
       aa.assessment_id,
       aa.course_id,
       aa.due_at,
       aa.last_attempt_id,
       a.title AS assessment_title,
       c.title AS course_title,
       p.display_name,
       att.score::text AS attempt_score
     FROM assessment_assignments aa
     JOIN assessments a ON a.id = aa.assessment_id
     LEFT JOIN courses c ON c.id = aa.course_id
     LEFT JOIN profiles p ON p.user_id = aa.learner_user_id
     LEFT JOIN assessment_attempts att ON att.id = aa.last_attempt_id
     WHERE aa.id = $1 AND aa.learner_user_id = $2
     LIMIT 1`,
    [assignmentId, userId],
  );

  const row = rows[0];
  if (!row) return null;

  let currentScore = "—";
  if (row.attempt_score != null) {
    currentScore = `${Math.round(Number(row.attempt_score))}%`;
  }

  return {
    learner_name: row.display_name ?? "there",
    course_name: row.course_title ?? "your course",
    assignment_name: row.assessment_title ?? "your assignment",
    due_date: row.due_at ? new Date(row.due_at).toLocaleDateString() : "soon",
    current_score: currentScore,
    retake_link: buildRetakeLink(assignmentId),
  };
}

function mergePlaceholders(
  fromDb: AssignmentEmailPlaceholders,
  overrides?: AssignmentEmailPlaceholders,
): Record<PlaceholderKey, string> {
  const merged: AssignmentEmailPlaceholders = { ...fromDb, ...overrides };
  return {
    learner_name: merged.learner_name ?? "there",
    course_name: merged.course_name ?? "your course",
    assignment_name: merged.assignment_name ?? "your assignment",
    due_date: merged.due_date ?? "soon",
    current_score: merged.current_score ?? "—",
    retake_link: merged.retake_link ?? "",
  };
}

export async function enqueueAssignmentEmailInDb(
  input: EnqueueAssignmentEmailInput,
): Promise<EnqueueAssignmentEmailResult> {
  const { user_id, assignment_id, email_type, placeholders: overrides } = input;

  const recipientEmail = await getProfileEmail(user_id);
  if (!recipientEmail) {
    return { ok: false, error: `No email found for user ${user_id}` };
  }

  const fromDb = await loadPlaceholdersFromDb(assignment_id, user_id);
  if (!fromDb) {
    return { ok: false, error: `Assignment ${assignment_id} not found for user ${user_id}` };
  }

  const placeholders = mergePlaceholders(fromDb, overrides);
  placeholders.retake_link = buildRetakeLink(assignment_id);

  const templateKey = TEMPLATE_KEY_BY_EMAIL_TYPE[email_type];
  const templateName = SES_TEMPLATE_BY_EMAIL_TYPE[email_type];
  const idempotencyKey = `${email_type}:${assignment_id}:${user_id}`;

  const existingLog = await findNotificationLogByIdempotency(idempotencyKey);
  if (existingLog) {
    return {
      ok: true,
      queued: false,
      reason: "duplicate_logged",
      notificationLogId: existingLog.id,
    };
  }

  const pendingQueue = await findPendingQueueByAssignmentAndType(assignment_id, email_type);
  if (pendingQueue) {
    return {
      ok: true,
      queued: false,
      reason: "duplicate_pending",
      queueId: pendingQueue.id,
    };
  }

  const tpl = await getEmailTemplate(templateKey);
  const subject = tpl
    ? substitute(tpl.subject, placeholders)
    : `Assignment notification (${email_type})`;

  let notificationLogId: string;
  try {
    notificationLogId = await insertNotificationLog({
      user_id,
      assignment_id,
      template_key: templateKey,
      audience: "learner",
      recipient_email: recipientEmail,
      subject,
      status: "queued",
      idempotency_key: idempotencyKey,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("idempotency_key") || message.includes("duplicate key")) {
      const dup = await findNotificationLogByIdempotency(idempotencyKey);
      return {
        ok: true,
        queued: false,
        reason: "duplicate_logged",
        notificationLogId: dup?.id,
      };
    }
    return { ok: false, error: message };
  }

  const payload = {
    user_id,
    assignment_id,
    email_type,
    template_name: templateName,
    template_key: templateKey,
    recipient_email: recipientEmail,
    placeholders,
    notification_log_id: notificationLogId,
    queued_at: new Date().toISOString(),
  };

  try {
    const queueId = await enqueueEmail(QUEUE_NAME, payload);
    if (!queueId) {
      await updateNotificationLog(notificationLogId, {
        status: "failed",
        error: "enqueue_email returned no id",
      });
      return { ok: false, error: "Failed to enqueue email — no queue id returned" };
    }

    await triggerEmailWorkflow({
      queueId,
      payload,
      emailType: email_type,
    });

    return { ok: true, queued: true, queueId, notificationLogId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateNotificationLog(notificationLogId, { status: "failed", error: message });
    return { ok: false, error: message };
  }
}
