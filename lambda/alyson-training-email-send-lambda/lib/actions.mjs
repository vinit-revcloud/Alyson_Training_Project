import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import {
  archiveQueueMessage,
  findNotificationLogByIdempotency,
  getAdminRecipientEmails,
  getAssignmentStatus,
  getEmailTemplate,
  insertNotificationLog,
} from "./db.mjs";
import { sendTemplatedEmail } from "./ses.mjs";
import { recordSendResult } from "./app-callback.mjs";
import {
  COMPLETE_STATUSES,
  TEMPLATE_KEY_BY_EMAIL_TYPE,
  WORKFLOW_EMAIL_TYPES,
  substitute,
} from "./constants.mjs";

let sfnClient;

function getSfnClient() {
  if (!sfnClient) {
    sfnClient = new SFNClient({ region: process.env.AWS_REGION || "us-west-2" });
  }
  return sfnClient;
}

function buildExecutionName(assignmentId, workflowType) {
  const shortId = String(assignmentId).replace(/-/g, "").slice(0, 8);
  return `assign-${shortId}-${workflowType}-${Date.now()}`;
}

export async function startWorkflow(event) {
  const { queue_id: queueId, payload } = event;
  if (!payload || !WORKFLOW_EMAIL_TYPES.has(payload.email_type)) {
    return { skipped: true, reason: "unsupported_email_type", email_type: payload?.email_type };
  }

  const stateMachineArn = process.env.STATE_MACHINE_ARN;
  if (!stateMachineArn) {
    throw new Error("STATE_MACHINE_ARN is not configured");
  }

  const workflowType = payload.email_type === "retake" ? "retake" : "initial";
  const workflowInput = {
    workflowType,
    assignment_id: payload.assignment_id,
    user_id: payload.user_id,
    recipient_email: payload.recipient_email,
    placeholders: payload.placeholders ?? {},
    first_email: {
      email_type: payload.email_type,
      template_name: payload.template_name,
      template_key: payload.template_key,
      notification_log_id: payload.notification_log_id,
    },
    source_queue_id: queueId ?? null,
  };

  const result = await getSfnClient().send(
    new StartExecutionCommand({
      stateMachineArn,
      name: buildExecutionName(payload.assignment_id, workflowType),
      input: JSON.stringify(workflowInput),
    }),
  );

  if (queueId != null) {
    await archiveQueueMessage(queueId);
  }

  return {
    executionArn: result.executionArn,
    workflowType,
    startedAt: result.startDate?.toISOString?.() ?? null,
  };
}

async function ensureNotificationLog({
  email_type,
  template_key,
  template_name,
  assignment_id,
  user_id,
  recipient_email,
  placeholders,
  audience,
  notification_log_id,
}) {
  if (notification_log_id) {
    return { notificationLogId: notification_log_id, skipped: false };
  }

  const resolvedTemplateKey = template_key || TEMPLATE_KEY_BY_EMAIL_TYPE[email_type];
  const idempotencyKey = `${email_type}:${assignment_id}:${user_id}`;
  const existing = await findNotificationLogByIdempotency(idempotencyKey);
  if (existing?.status === "sent") {
    return { notificationLogId: existing.id, skipped: true, reason: "already_sent" };
  }
  if (existing) {
    return { notificationLogId: existing.id, skipped: false };
  }

  const tpl = await getEmailTemplate(resolvedTemplateKey);
  const subject = tpl
    ? substitute(tpl.subject, placeholders ?? {})
    : `Assignment notification (${email_type})`;

  const notificationLogId = await insertNotificationLog({
    user_id,
    assignment_id,
    template_key: resolvedTemplateKey,
    audience: audience ?? tpl?.audience ?? "learner",
    recipient_email,
    subject,
    status: "queued",
    idempotency_key: idempotencyKey,
  });

  return { notificationLogId, skipped: false, template_name: template_name };
}

export async function sendEmail(event) {
  const {
    email_type,
    template_name,
    template_key,
    assignment_id,
    user_id,
    recipient_email,
    placeholders,
    notification_log_id,
    audience = "learner",
  } = event;

  const isEscalation = email_type === "escalation_day30";
  const recipients = isEscalation
    ? await getAdminRecipientEmails()
    : recipient_email
      ? [recipient_email]
      : [];

  if (!recipients.length) {
    return {
      status: "suppressed",
      error: isEscalation ? "no_admin_recipients" : "missing_recipient",
      notification_log_id: notification_log_id ?? null,
    };
  }

  const primaryRecipient = recipients[0];
  const logResult = await ensureNotificationLog({
    email_type,
    template_key,
    template_name,
    assignment_id,
    user_id,
    recipient_email: primaryRecipient,
    placeholders,
    audience: isEscalation ? "admin" : audience,
    notification_log_id,
  });

  if (logResult.skipped) {
    return {
      status: "suppressed",
      reason: logResult.reason,
      notification_log_id: logResult.notificationLogId,
    };
  }

  const resolvedTemplateName = template_name;
  const messageIds = [];
  let lastError = null;

  for (const to of recipients) {
    try {
      const messageId = await sendTemplatedEmail({
        to,
        templateName: resolvedTemplateName,
        placeholders: placeholders ?? {},
      });
      if (messageId) messageIds.push(messageId);
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      console.error(`[email-lambda] SES send failed to=${to}`, lastError);
    }
  }

  const status = messageIds.length ? "sent" : "failed";
  const message_id = messageIds[0] ?? undefined;

  try {
    await recordSendResult({
      notification_log_id: logResult.notificationLogId,
      message_id,
      status,
      error: lastError,
      assignment_id,
      user_id,
      email_type,
      template_name: resolvedTemplateName,
    });
  } catch (err) {
    console.error("[email-lambda] send-result callback error", err);
  }

  return {
    status,
    message_id,
    notification_log_id: logResult.notificationLogId,
    recipients_sent: messageIds.length,
    error: lastError,
  };
}

export async function checkAssignment(event) {
  const { assignment_id, user_id } = event;
  const row = await getAssignmentStatus(assignment_id, user_id);

  if (!row) {
    return {
      isComplete: true,
      status: "not_found",
      attempts_used: 0,
      max_attempts: 0,
      shouldRemind: false,
      shouldEscalate: false,
    };
  }

  const isComplete = COMPLETE_STATUSES.has(row.status);

  return {
    isComplete,
    status: row.status,
    attempts_used: row.attempts_used,
    max_attempts: row.max_attempts,
    shouldRemind: !isComplete,
    shouldEscalate: !isComplete,
  };
}
