import { CronExpressionParser } from "cron-parser";
import { getPgPool } from "@/lib/pg.server";
import { processEmailQueue } from "@/lib/email/process-queue";
import type { JobKey } from "@/lib/email/schedules-api";
import {
  runDailyReminders,
  runEscalations,
  runRetryFailed,
  runWeeklyCeoSummary,
} from "@/lib/email/triggers.server";

const SCHEDULED_JOBS = new Set<JobKey>(["reminder_daily", "escalation", "weekly_ceo_summary"]);

interface ScheduleRow {
  job_key: string;
  enabled: boolean;
  cron_expression: string;
  last_run_at: string | null;
}

export interface CronJobResult {
  job_key: string;
  ran: boolean;
  skipped?: string;
  result?: Record<string, unknown>;
  error?: string;
}

export interface CronTickResult {
  ok: true;
  at: string;
  jobs: CronJobResult[];
  retryFailed?: { retried: number };
  queue: { processed: number; stopped?: string };
}

function isCronDue(cronExpression: string, lastRunAt: string | null, now: Date): boolean {
  if (!cronExpression || cronExpression === "on_event") return false;
  try {
    const from = lastRunAt ? new Date(lastRunAt) : new Date(0);
    const interval = CronExpressionParser.parse(cronExpression, {
      currentDate: from,
      tz: "UTC",
    });
    const nextRun = interval.next().toDate();
    return nextRun.getTime() <= now.getTime();
  } catch (err) {
    console.warn("[cron] invalid expression", cronExpression, err);
    return false;
  }
}

async function loadSchedules(): Promise<ScheduleRow[]> {
  const pool = getPgPool();
  const { rows } = await pool.query<ScheduleRow>(
    `SELECT job_key, enabled, cron_expression, last_run_at
     FROM notification_schedules
     WHERE enabled = true
       AND cron_expression IS NOT NULL
       AND cron_expression <> 'on_event'
     ORDER BY job_key`,
  );
  return rows;
}

async function runJob(jobKey: JobKey): Promise<Record<string, unknown>> {
  switch (jobKey) {
    case "reminder_daily":
      return runDailyReminders();
    case "escalation":
      return runEscalations();
    case "weekly_ceo_summary":
      return runWeeklyCeoSummary();
    default:
      return {};
  }
}

/** Drain invite/auth/interview transactional queues in production (not assignment Step Functions). */
async function processTransactionalEmailQueues(): Promise<{
  processed: number;
  stopped?: string;
}> {
  return processEmailQueue();
}

/** Evaluate DB schedules, run due jobs, drain transactional email queue via SES. */
export async function runCronTick(): Promise<CronTickResult> {
  const now = new Date();
  const schedules = await loadSchedules();
  const jobs: CronJobResult[] = [];

  for (const row of schedules) {
    const jobKey = row.job_key as JobKey;
    if (!SCHEDULED_JOBS.has(jobKey)) {
      jobs.push({ job_key: row.job_key, ran: false, skipped: "not_a_scheduled_job" });
      continue;
    }
    if (!isCronDue(row.cron_expression, row.last_run_at, now)) {
      jobs.push({ job_key: row.job_key, ran: false, skipped: "not_due" });
      continue;
    }
    try {
      const result = await runJob(jobKey);
      jobs.push({ job_key: row.job_key, ran: true, result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[cron] job failed", jobKey, message);
      jobs.push({ job_key: row.job_key, ran: false, error: message });
    }
  }

  let retryFailed: { retried: number } | undefined;
  if (now.getUTCMinutes() < 5) {
    try {
      retryFailed = await runRetryFailed();
    } catch (err) {
      console.warn("[cron] retry-failed failed", err);
    }
  }

  // Production: drain transactional/auth queues; assignment workflow may use Step Functions separately.
  const queue =
    process.env.EMAIL_AUTO_PROCESS === "1"
      ? await processEmailQueue()
      : await processTransactionalEmailQueues();

  return {
    ok: true,
    at: now.toISOString(),
    jobs,
    ...(retryFailed ? { retryFailed } : {}),
    queue,
  };
}
