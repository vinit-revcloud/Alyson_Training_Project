import {
  getEmailTemplateFn,
  listEmailTemplatesFn,
  listEmailTemplateVersionsFn,
  listRecentNotificationLogsFn,
  saveEmailTemplateFn,
} from "@/lib/email/email-templates.functions";

export const TEMPLATE_KEYS = [
  "assignment_new",
  "reminder_daily",
  "escalation_day7",
  "escalation_day14",
  "escalation_day30",
  "failure_retake",
  "invite_new",
  "test_completed",
  "weekly_ceo_summary",
] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

export const TEMPLATE_LABELS: Record<TemplateKey, { label: string; description: string }> = {
  assignment_new: {
    label: "New assignment",
    description: "Sent the moment a test is assigned to a learner.",
  },
  reminder_daily: {
    label: "Daily reminder",
    description: "Sent every day at 09:00 UTC while an assignment is pending.",
  },
  escalation_day7: {
    label: "Day 7 escalation",
    description: "First warning when an assignment is 7 days overdue.",
  },
  escalation_day14: {
    label: "Day 14 escalation",
    description: "Second warning; CC'd to HR.",
  },
  escalation_day30: {
    label: "Day 30 escalation",
    description: "Pauses the assignment; notifies HR, CEO, and admins. May deactivate the learner.",
  },
  failure_retake: {
    label: "Failure + retake offer",
    description: "Sent after a failed attempt to offer a retake.",
  },
  invite_new: {
    label: "Workspace invite",
    description: "Sent when an admin invites someone to join Alyson Training.",
  },
  test_completed: {
    label: "Test submitted",
    description: "Notifies trainers and leadership when a learner submits a test.",
  },
  weekly_ceo_summary: {
    label: "Weekly CEO summary",
    description: "Weekly rollup of assignment completion sent to admins.",
  },
};

export interface EmailTemplateRow {
  id: string;
  key: TemplateKey;
  audience: string;
  subject: string;
  body_md: string;
  updated_at: string;
}

export async function listTemplates(): Promise<EmailTemplateRow[]> {
  return listEmailTemplatesFn();
}

export async function getTemplate(key: TemplateKey): Promise<EmailTemplateRow | null> {
  return getEmailTemplateFn({ data: { key } });
}

export async function saveTemplate(input: {
  id: string;
  subject: string;
  body_md: string;
}): Promise<void> {
  await saveEmailTemplateFn({ data: input });
}

export interface TemplateVersionRow {
  id: string;
  template_id: string;
  subject: string;
  body_md: string;
  created_at: string;
}

export async function listVersions(templateId: string): Promise<TemplateVersionRow[]> {
  return listEmailTemplateVersionsFn({ data: { templateId } });
}

export interface NotificationLogRow {
  id: string;
  user_id: string | null;
  assignment_id: string | null;
  template_key: string;
  audience: string;
  recipient_email: string;
  subject: string;
  status: "pending" | "sent" | "failed" | "bounced";
  error: string | null;
  attempt: number;
  sent_at: string | null;
  created_at: string;
}

export async function listRecentLogs(limit = 100): Promise<NotificationLogRow[]> {
  return listRecentNotificationLogsFn({ data: { limit } });
}
