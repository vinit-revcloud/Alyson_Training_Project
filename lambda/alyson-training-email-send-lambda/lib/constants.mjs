export const WORKFLOW_EMAIL_TYPES = new Set(["initial", "retake"]);

export const TEMPLATE_KEY_BY_EMAIL_TYPE = {
  initial: "assignment_new",
  reminder_day7: "escalation_day7",
  reminder_day14: "escalation_day14",
  retake: "failure_retake",
  escalation_day30: "escalation_day30",
};

export const SES_TEMPLATE_BY_EMAIL_TYPE = {
  initial: "assignment_email",
  reminder_day7: "reminder_day7",
  reminder_day14: "reminder_day14",
  retake: "retake_reminder",
  escalation_day30: "escalation_day30",
};

export const COMPLETE_STATUSES = new Set(["passed", "failed_capped", "expired"]);

export const ADMIN_ROLES = ["admin", "ceo", "hiring_manager"];

export function substitute(text, vars) {
  return text.replace(/\{(\w+)\}/g, (_m, key) => vars[key] ?? "");
}
