import { z } from "zod";
import {
  insertEmailSendLog,
  updateNotificationLog,
} from "@/lib/email/email-db.server";
import { getPgPool } from "@/lib/pg.server";

export const EmailSendResultSchema = z.object({
  notification_log_id: z.string().uuid(),
  message_id: z.string().optional(),
  status: z.enum(["sent", "failed", "suppressed"]),
  error: z.string().optional().nullable(),
  assignment_id: z.string().uuid().optional(),
  user_id: z.string().uuid().optional(),
  email_type: z.string().optional(),
  template_name: z.string().optional(),
});

export type EmailSendResultInput = z.infer<typeof EmailSendResultSchema>;

export async function recordEmailSendResult(
  input: EmailSendResultInput,
): Promise<{ ok: true }> {
  const pool = getPgPool();
  const { rows } = await pool.query<{
    recipient_email: string;
    template_key: string;
  }>(
    `SELECT recipient_email, template_key FROM notification_log WHERE id = $1 LIMIT 1`,
    [input.notification_log_id],
  );

  const log = rows[0];
  if (!log) {
    throw new Error(`notification_log not found: ${input.notification_log_id}`);
  }

  const sentAt = input.status === "sent" ? new Date().toISOString() : null;

  await updateNotificationLog(input.notification_log_id, {
    status: input.status,
    provider_message_id: input.message_id ?? null,
    sent_at: sentAt,
    error: input.error ?? null,
  });

  const templateName = input.template_name ?? log.template_key;
  const metadata: Record<string, unknown> = {};
  if (input.assignment_id) metadata.assignment_id = input.assignment_id;
  if (input.user_id) metadata.user_id = input.user_id;
  if (input.email_type) metadata.email_type = input.email_type;
  metadata.notification_log_id = input.notification_log_id;

  await insertEmailSendLog({
    message_id: input.message_id ?? null,
    template_name: templateName,
    recipient_email: log.recipient_email,
    status: input.status,
    error_message: input.error ?? null,
    metadata: Object.keys(metadata).length ? metadata : null,
  });

  return { ok: true };
}
