/**
 * Legacy in-app SES drain — replaced by AWS Step Functions workflow.
 * Assignment workflow emails are enqueue-only; Step Functions + Lambda send via SES.
 * Use only for manual local testing: Settings → Process queue, /api/internal/email/process,
 * or when EMAIL_AUTO_PROCESS=1 in development.
 */
import { sesSend, SesSendError } from "./ses-send";
import {
  countFailedSendLogs,
  deleteEmailFromQueue,
  getEmailSendState,
  hasSentEmailLog,
  insertEmailSendLog,
  isEmailSuppressed,
  moveEmailToDlq,
  readEmailBatch,
  setEmailRetryAfter,
  touchEmailSendState,
  updateNotificationLogByIdempotency,
} from "./email-db.server";

const MAX_RETRIES = 5;
const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_SEND_DELAY_MS = 200;
const DEFAULT_AUTH_TTL_MINUTES = 15;
const DEFAULT_TRANSACTIONAL_TTL_MINUTES = 60;

function isRateLimited(error: unknown): boolean {
  if (error instanceof SesSendError) return error.status === 429;
  if (error && typeof error === "object" && "status" in error) {
    return (error as { status: number }).status === 429;
  }
  return error instanceof Error && error.message.includes("429");
}

function isForbidden(error: unknown): boolean {
  if (error instanceof SesSendError) return error.status === 403;
  if (error && typeof error === "object" && "status" in error) {
    return (error as { status: number }).status === 403;
  }
  return error instanceof Error && error.message.includes("403");
}

function getRetryAfterSeconds(error: unknown): number {
  if (error instanceof SesSendError && error.retryAfterSeconds != null) {
    return error.retryAfterSeconds;
  }
  return 60;
}

async function moveToDlq(
  queue: string,
  msg: { msg_id: number; message: Record<string, unknown> },
  reason: string,
): Promise<void> {
  const payload = msg.message;
  await insertEmailSendLog({
    message_id: payload.message_id as string | undefined,
    template_name: (payload.label || queue) as string,
    recipient_email: payload.to as string,
    status: "dlq",
    error_message: reason,
  });
  try {
    await moveEmailToDlq(queue, `${queue}_dlq`, msg.msg_id, payload);
  } catch (error) {
    console.error("Failed to move message to DLQ", { queue, msg_id: msg.msg_id, reason, error });
  }
}

export async function processEmailQueue(): Promise<{
  processed: number;
  stopped?: string;
}> {
  const state = await getEmailSendState();

  if (state?.retry_after_until && new Date(state.retry_after_until) > new Date()) {
    return { processed: 0, stopped: "rate_limited" };
  }

  const batchSize = state?.batch_size ?? DEFAULT_BATCH_SIZE;
  const sendDelayMs = state?.send_delay_ms ?? DEFAULT_SEND_DELAY_MS;
  const ttlMinutes: Record<string, number> = {
    auth_emails: state?.auth_email_ttl_minutes ?? DEFAULT_AUTH_TTL_MINUTES,
    transactional_emails: state?.transactional_email_ttl_minutes ?? DEFAULT_TRANSACTIONAL_TTL_MINUTES,
  };

  let totalProcessed = 0;

  for (const queue of ["auth_emails", "transactional_emails"]) {
    let messages: Awaited<ReturnType<typeof readEmailBatch>>;
    try {
      messages = await readEmailBatch(queue, batchSize, 30);
    } catch (error) {
      console.error("Failed to read email batch", { queue, error });
      continue;
    }
    if (!messages.length) continue;

    const messageIds = Array.from(
      new Set(
        messages
          .map((msg) =>
            msg.message?.message_id && typeof msg.message.message_id === "string"
              ? msg.message.message_id
              : null,
          )
          .filter((id): id is string => Boolean(id)),
      ),
    );
    const failedAttemptsByMessageId = await countFailedSendLogs(messageIds);

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const payload = msg.message;
      const to = payload.to as string;
      const failedAttempts =
        payload?.message_id && typeof payload.message_id === "string"
          ? (failedAttemptsByMessageId.get(payload.message_id) ?? 0)
          : (msg.read_ct ?? 0);

      const queuedAt = (payload.queued_at as string | undefined) ?? msg.enqueued_at;
      if (queuedAt) {
        const ageMs = Date.now() - new Date(queuedAt).getTime();
        const maxAgeMs = ttlMinutes[queue] * 60 * 1000;
        if (ageMs > maxAgeMs) {
          await moveToDlq(queue, msg, `TTL exceeded (${ttlMinutes[queue]} minutes)`);
          continue;
        }
      }

      if (failedAttempts >= MAX_RETRIES) {
        await moveToDlq(
          queue,
          msg,
          `Max retries (${MAX_RETRIES}) exceeded (attempted ${failedAttempts} times)`,
        );
        continue;
      }

      if (payload.message_id && typeof payload.message_id === "string") {
        if (await hasSentEmailLog(payload.message_id)) {
          await deleteEmailFromQueue(queue, msg.msg_id);
          continue;
        }
      }

      if (to && (await isEmailSuppressed(to))) {
        await insertEmailSendLog({
          message_id: payload.message_id as string | undefined,
          template_name: (payload.label || queue) as string,
          recipient_email: to,
          status: "suppressed",
          error_message: "Recipient on suppression list",
        });
        await deleteEmailFromQueue(queue, msg.msg_id);
        continue;
      }

      try {
        const { messageId } = await sesSend({
          to,
          subject: payload.subject as string,
          html: payload.html as string,
          text: payload.text as string | undefined,
        });

        await insertEmailSendLog({
          message_id: (payload.message_id as string | undefined) ?? messageId,
          template_name: (payload.label || queue) as string,
          recipient_email: to,
          status: "sent",
          metadata: { ses_message_id: messageId },
        });

        if (payload.idempotency_key && typeof payload.idempotency_key === "string") {
          await updateNotificationLogByIdempotency(payload.idempotency_key, {
            status: "sent",
            sent_at: new Date().toISOString(),
            provider_message_id: messageId,
          });
        }

        await deleteEmailFromQueue(queue, msg.msg_id);
        totalProcessed++;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error("Email send failed", { queue, msg_id: msg.msg_id, error: errorMsg });

        if (isRateLimited(error)) {
          await insertEmailSendLog({
            message_id: payload.message_id as string | undefined,
            template_name: (payload.label || queue) as string,
            recipient_email: to,
            status: "failed",
            error_message: errorMsg.slice(0, 1000),
          });
          const retryAfterSecs = getRetryAfterSeconds(error);
          await setEmailRetryAfter(new Date(Date.now() + retryAfterSecs * 1000).toISOString());
          return { processed: totalProcessed, stopped: "rate_limited" };
        }

        if (isForbidden(error)) {
          await moveToDlq(queue, msg, errorMsg.slice(0, 1000));
          return { processed: totalProcessed, stopped: "forbidden" };
        }

        await insertEmailSendLog({
          message_id: payload.message_id as string | undefined,
          template_name: (payload.label || queue) as string,
          recipient_email: to,
          status: "failed",
          error_message: errorMsg.slice(0, 1000),
        });
        if (payload?.message_id && typeof payload.message_id === "string") {
          failedAttemptsByMessageId.set(payload.message_id, failedAttempts + 1);
        }
      }

      if (i < messages.length - 1) {
        await new Promise((r) => setTimeout(r, sendDelayMs));
      }
    }
  }

  if (totalProcessed > 0) {
    await touchEmailSendState();
  }

  return { processed: totalProcessed };
}
