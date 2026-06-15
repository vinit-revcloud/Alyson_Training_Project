export const ASSIGNMENT_EMAIL_TYPES = [
  "initial",
  "reminder_day7",
  "reminder_day14",
  "retake",
  "escalation_day30",
] as const;

export type AssignmentEmailType = (typeof ASSIGNMENT_EMAIL_TYPES)[number];

export type EnqueueAssignmentEmailResult =
  | { ok: true; queued: true; queueId: number; notificationLogId: string }
  | {
      ok: true;
      queued: false;
      reason: "duplicate_pending" | "duplicate_logged";
      queueId?: number;
      notificationLogId?: string;
    }
  | { ok: false; error: string };
