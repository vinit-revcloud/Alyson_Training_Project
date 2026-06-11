import { fetchEmailMetricsFn } from "@/lib/email/email-settings.functions";

export type EmailStatus =
  | "sent"
  | "pending"
  | "queued"
  | "failed"
  | "bounced"
  | "complained"
  | "suppressed";

export interface EmailLogRow {
  id: string;
  recipient_email: string;
  subject: string;
  kind: string;
  audience: string;
  status: EmailStatus;
  sent_at: string | null;
  created_at: string;
  provider_message_id: string | null;
  error_message: string | null;
}

export interface EmailMetrics {
  total: number;
  sent: number;
  pending: number;
  failed: number;
  bounced: number;
  recent: EmailLogRow[];
  escalations: EmailLogRow[];
}

export async function fetchEmailMetrics(): Promise<EmailMetrics> {
  return fetchEmailMetricsFn();
}
