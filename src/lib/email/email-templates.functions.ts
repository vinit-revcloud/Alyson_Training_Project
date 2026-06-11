import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireDbAuth } from "@/integrations/neon/auth-middleware";
import { requireAdminUserId } from "@/lib/auth-token.server";
import { getPgPool } from "@/lib/pg.server";
import type {
  EmailTemplateRow,
  NotificationLogRow,
  TemplateKey,
  TemplateVersionRow,
} from "@/lib/email/templates-api";

export const listEmailTemplatesFn = createServerFn({ method: "GET" })
  .middleware([requireDbAuth])
  .handler(async (): Promise<EmailTemplateRow[]> => {
    await requireAdminUserId();
    const pool = getPgPool();
    const { rows } = await pool.query<EmailTemplateRow>(
      `SELECT * FROM email_templates ORDER BY key`,
    );
    return rows;
  });

export const getEmailTemplateFn = createServerFn({ method: "POST" })
  .middleware([requireDbAuth])
  .inputValidator((data: unknown) => z.object({ key: z.string() }).parse(data))
  .handler(async ({ data }): Promise<EmailTemplateRow | null> => {
    await requireAdminUserId();
    const pool = getPgPool();
    const { rows } = await pool.query<EmailTemplateRow>(
      `SELECT * FROM email_templates WHERE key = $1`,
      [data.key],
    );
    return rows[0] ?? null;
  });

export const saveEmailTemplateFn = createServerFn({ method: "POST" })
  .middleware([requireDbAuth])
  .inputValidator((data: unknown) =>
    z.object({ id: z.string().uuid(), subject: z.string(), body_md: z.string() }).parse(data),
  )
  .handler(async ({ data }) => {
    await requireAdminUserId();
    const pool = getPgPool();
    const current = await pool.query<{ key: string; subject: string; body_md: string }>(
      `SELECT key, subject, body_md FROM email_templates WHERE id = $1`,
      [data.id],
    );
    if (!current.rows[0]) throw new Error("Template not found");
    const row = current.rows[0];
    await pool.query(
      `INSERT INTO email_template_versions (template_id, key, subject, body_md)
       VALUES ($1, $2, $3, $4)`,
      [data.id, row.key, row.subject, row.body_md],
    );
    await pool.query(`UPDATE email_templates SET subject = $1, body_md = $2 WHERE id = $3`, [
      data.subject,
      data.body_md,
      data.id,
    ]);
    return { ok: true as const };
  });

export const listEmailTemplateVersionsFn = createServerFn({ method: "POST" })
  .middleware([requireDbAuth])
  .inputValidator((data: unknown) => z.object({ templateId: z.string().uuid() }).parse(data))
  .handler(async ({ data }): Promise<TemplateVersionRow[]> => {
    await requireAdminUserId();
    const pool = getPgPool();
    const { rows } = await pool.query<TemplateVersionRow>(
      `SELECT * FROM email_template_versions
       WHERE template_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [data.templateId],
    );
    return rows;
  });

export const listRecentNotificationLogsFn = createServerFn({ method: "POST" })
  .middleware([requireDbAuth])
  .inputValidator((data: unknown) => z.object({ limit: z.number().int().min(1).max(500).optional() }).parse(data ?? {}))
  .handler(async ({ data }): Promise<NotificationLogRow[]> => {
    await requireAdminUserId();
    const pool = getPgPool();
    const { rows } = await pool.query<NotificationLogRow>(
      `SELECT * FROM notification_log ORDER BY created_at DESC LIMIT $1`,
      [data.limit ?? 100],
    );
    return rows;
  });

export type { TemplateKey };
