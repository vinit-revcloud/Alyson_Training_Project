import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireDbAuth } from "@/integrations/neon/auth-middleware";
import { requireAdminUserId } from "@/lib/auth-token.server";
import { getPgPool } from "@/lib/pg.server";
import type { JobKey, NotificationScheduleRow, ScheduleConfig } from "./schedules-api";

export const listSchedulesFn = createServerFn({ method: "GET" })
  .middleware([requireDbAuth])
  .handler(async (): Promise<NotificationScheduleRow[]> => {
    await requireAdminUserId();
    const pool = getPgPool();
    const { rows } = await pool.query<NotificationScheduleRow>(
      `SELECT * FROM notification_schedules ORDER BY job_key`,
    );
    return rows;
  });

export const saveScheduleFn = createServerFn({ method: "POST" })
  .middleware([requireDbAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        job_key: z.string(),
        enabled: z.boolean(),
        cron_expression: z.string(),
        config: z.record(z.unknown()),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    await requireAdminUserId();
    const pool = getPgPool();
    await pool.query(
      `UPDATE notification_schedules
       SET enabled = $1, cron_expression = $2, config = $3::jsonb
       WHERE job_key = $4`,
      [data.enabled, data.cron_expression, JSON.stringify(data.config), data.job_key],
    );
    return { ok: true as const };
  });

export const runJobNow = createServerFn({ method: "POST" })
  .middleware([requireDbAuth])
  .inputValidator((d: unknown) => z.object({ jobKey: z.string() }).parse(d))
  .handler(async ({ data }) => {
    await requireAdminUserId();

    const triggers = await import("./triggers.server");
    const jobKey = data.jobKey as JobKey;
    if (jobKey === "reminder_daily") {
      const r = await triggers.runDailyReminders();
      return { queued: r.queued };
    }
    if (jobKey === "escalation") {
      const r = await triggers.runEscalations();
      return { queued: r.queued, paused: r.paused, deactivated: r.deactivated };
    }
    if (jobKey === "failure_retake") {
      const r = await triggers.runRetryFailed();
      return { queued: 0, retried: r.retried };
    }
    if (jobKey === "weekly_ceo_summary") {
      const r = await triggers.runWeeklyCeoSummary();
      return { queued: r.queued };
    }
    return { queued: 0, note: "Event-driven job: fires on assignment or test submit" };
  });

export type { ScheduleConfig };
