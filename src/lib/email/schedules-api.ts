import { listSchedulesFn, saveScheduleFn } from "@/lib/email/schedules.functions";

export type JobKey =
  | "assignment_new"
  | "reminder_daily"
  | "escalation"
  | "failure_retake"
  | "test_completed"
  | "weekly_ceo_summary";

export interface EscalationTier {
  days: number;
  audiences: ("learner" | "hr" | "ceo" | "admin")[];
}

export interface ScheduleConfig {
  immediate?: boolean;
  only_when_due_within_days?: number | null;
  delay_hours?: number;
  tiers?: EscalationTier[];
}

export interface NotificationScheduleRow {
  job_key: JobKey;
  label: string;
  enabled: boolean;
  cron_expression: string;
  config: ScheduleConfig;
  last_run_at: string | null;
  last_run_queued: number | null;
  updated_at: string;
}

export const JOB_META: Record<JobKey, { label: string; description: string; eventDriven: boolean }> = {
  assignment_new: {
    label: "New assignment notice",
    description: "Sent the moment a test is assigned to a learner.",
    eventDriven: true,
  },
  reminder_daily: {
    label: "Daily reminders",
    description: "Recurring reminder while an assignment is pending.",
    eventDriven: false,
  },
  escalation: {
    label: "Overdue escalations",
    description: "Tiered escalations as days overdue accumulate.",
    eventDriven: false,
  },
  failure_retake: {
    label: "Failure / retake offer",
    description: "Sent after a learner fails an attempt.",
    eventDriven: true,
  },
  test_completed: {
    label: "Test submitted notice",
    description: "Notifies trainers and leadership when a learner submits a test.",
    eventDriven: true,
  },
  weekly_ceo_summary: {
    label: "Weekly CEO summary",
    description: "Monday morning rollup of assignment completion.",
    eventDriven: false,
  },
};

export const CRON_PRESETS: { value: string; label: string }[] = [
  { value: "0 * * * *", label: "Every hour" },
  { value: "0 9 * * *", label: "Daily at 9:00 UTC" },
  { value: "0 18 * * *", label: "Daily at 18:00 UTC" },
  { value: "0 9 * * 1-5", label: "Weekdays at 9:00 UTC" },
];

export async function listSchedules(): Promise<NotificationScheduleRow[]> {
  return listSchedulesFn();
}

export async function saveSchedule(input: {
  job_key: JobKey;
  enabled: boolean;
  cron_expression: string;
  config: ScheduleConfig;
}): Promise<void> {
  await saveScheduleFn({ data: input });
}
