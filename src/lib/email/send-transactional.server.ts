import {
  findNotificationLogByIdempotency,
  insertEmailSendLog,
  insertNotificationLog,
  isEmailSuppressed,
  updateNotificationLog,
} from "@/lib/email/email-db.server";
import { sesSend } from "@/lib/email/ses-send";

export interface SendTransactionalEmailInput {
  templateKey: string;
  to: string;
  subject: string;
  html: string;
  idempotencyKey: string;
  audience?: string;
  userId?: string;
  assignmentId?: string;
}

export interface SendTransactionalEmailResult {
  ok: boolean;
  messageId?: string;
  notificationLogId?: string;
  error?: string;
  skipped?: boolean;
}

/** Send one transactional email immediately via SES (no queue / cron). */
export async function sendTransactionalEmailNow(
  input: SendTransactionalEmailInput,
): Promise<SendTransactionalEmailResult> {
  const existing = await findNotificationLogByIdempotency(input.idempotencyKey);
  if (existing) {
    return { ok: true, skipped: true, notificationLogId: existing.id };
  }

  const messageId =
    globalThis.crypto?.randomUUID?.() ?? `${input.idempotencyKey}-${Date.now()}`;

  let logId: string;
  try {
    logId = await insertNotificationLog({
      user_id: input.userId,
      assignment_id: input.assignmentId,
      template_key: input.templateKey,
      audience: input.audience ?? "learner",
      recipient_email: input.to,
      subject: input.subject,
      status: "pending",
      idempotency_key: input.idempotencyKey,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("idempotency_key") || message.includes("duplicate key")) {
      const dup = await findNotificationLogByIdempotency(input.idempotencyKey);
      return { ok: true, skipped: true, notificationLogId: dup?.id };
    }
    return { ok: false, error: message };
  }

  if (await isEmailSuppressed(input.to)) {
    const error = "Recipient on suppression list";
    await insertEmailSendLog({
      message_id: messageId,
      template_name: input.templateKey,
      recipient_email: input.to,
      status: "suppressed",
      error_message: error,
    });
    await updateNotificationLog(logId, { status: "failed", error });
    return { ok: false, error, notificationLogId: logId };
  }

  try {
    const { messageId: sesMessageId } = await sesSend({
      to: input.to,
      subject: input.subject,
      html: input.html,
    });

    await insertEmailSendLog({
      message_id: messageId,
      template_name: input.templateKey,
      recipient_email: input.to,
      status: "sent",
      metadata: { ses_message_id: sesMessageId },
    });
    await updateNotificationLog(logId, {
      status: "sent",
      provider_message_id: sesMessageId,
      sent_at: new Date().toISOString(),
    });

    return { ok: true, messageId: sesMessageId, notificationLogId: logId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await insertEmailSendLog({
      message_id: messageId,
      template_name: input.templateKey,
      recipient_email: input.to,
      status: "failed",
      error_message: message.slice(0, 1000),
    });
    await updateNotificationLog(logId, { status: "failed", error: message });
    return { ok: false, error: message, notificationLogId: logId };
  }
}
