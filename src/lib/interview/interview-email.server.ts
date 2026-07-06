import { renderTemplate, type PlaceholderKey } from "@/lib/email/render";
import { getEmailTemplate } from "@/lib/email/email-db.server";
import { sendTransactionalEmailNow } from "@/lib/email/send-transactional.server";
import { getPgPool } from "@/lib/pg.server";
import { getUserEmail } from "@/lib/user-email";
import { supabaseAdmin } from "@/integrations/neon/client.server";

async function appUrl(path: string): Promise<string> {
  const { getServerConfig } = await import("@/lib/config.server");
  const base = getServerConfig().appBaseUrl.replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function sendInterviewInviteEmail(opts: {
  sessionId: string;
  rawToken: string;
  candidateEmail: string;
  candidateName: string;
  assessmentTitle: string;
  role: string;
  scheduledAt: string;
}): Promise<{ ok: boolean; queued: number; error?: string }> {
  const tpl = await getEmailTemplate("interview_invite");
  if (!tpl) return { ok: false, queued: 0, error: "interview_invite template missing" };

  const link = await appUrl(`/interview/${opts.rawToken}`);
  const vars: Partial<Record<PlaceholderKey, string>> = {
    learner_name: opts.candidateName,
    course_name: opts.role,
    assignment_name: opts.assessmentTitle,
    due_date: new Date(opts.scheduledAt).toLocaleString(),
    current_score: "—",
    retake_link: link,
  };
  const { subject, html } = renderTemplate({ subject: tpl.subject, bodyMd: tpl.body_md, vars });
  const today = new Date().toISOString().slice(0, 10);
  const idem = `interview_invite:${opts.sessionId}:${opts.candidateEmail}:${today}`;

  const result = await sendTransactionalEmailNow({
    templateKey: "interview_invite",
    to: opts.candidateEmail,
    subject,
    html,
    idempotencyKey: idem,
  });

  if (result.skipped) {
    return { ok: true, queued: 0 };
  }
  if (!result.ok) {
    return { ok: false, queued: 0, error: result.error };
  }
  return { ok: true, queued: 1 };
}

export async function notifyInterviewSubmitted(sessionId: string): Promise<number> {
  const pool = getPgPool();
  const { rows } = await pool.query<{
    candidate_name: string;
    assessment_title: string;
  }>(
    `SELECT s.candidate_name, a.title AS assessment_title
     FROM interview_sessions s JOIN assessments a ON a.id = s.assessment_id
     WHERE s.id = $1`,
    [sessionId],
  );
  const row = rows[0];
  if (!row) return 0;

  const tpl = await getEmailTemplate("interview_submitted");
  if (!tpl) return 0;

  const link = await appUrl(`/interviews/${sessionId}`);
  const vars: Partial<Record<PlaceholderKey, string>> = {
    learner_name: row.candidate_name,
    course_name: "Interview",
    assignment_name: row.assessment_title,
    due_date: "—",
    current_score: "Pending AI evaluation",
    retake_link: link,
  };
  const { subject, html } = renderTemplate({ subject: tpl.subject, bodyMd: tpl.body_md, vars });

  const { data: admins } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .in("role", ["admin", "trainer"]);

  const today = new Date().toISOString().slice(0, 10);
  let queued = 0;
  for (const admin of admins ?? []) {
    const email = await getUserEmail(supabaseAdmin, admin.user_id);
    if (!email) continue;
    const idem = `interview_submitted:${sessionId}:${email}:${today}`;
    const messageId = globalThis.crypto?.randomUUID?.() ?? `${idem}-${Date.now()}`;
    try {
      await enqueueEmail("transactional_emails", {
        to: email,
        subject,
        html,
        label: "interview_submitted",
        message_id: messageId,
        idempotency_key: idem,
        queued_at: new Date().toISOString(),
      });
      queued += 1;
    } catch (e) {
      console.warn("[email] interview_submitted enqueue failed", e);
    }
  }
  return queued;
}

export async function notifyInterviewEvaluated(sessionId: string): Promise<number> {
  const pool = getPgPool();
  const { rows } = await pool.query<{
    candidate_name: string;
    assessment_title: string;
    final_score: number | null;
  }>(
    `SELECT s.candidate_name, a.title AS assessment_title, s.final_score
     FROM interview_sessions s JOIN assessments a ON a.id = s.assessment_id
     WHERE s.id = $1`,
    [sessionId],
  );
  const row = rows[0];
  if (!row) return 0;

  const tpl = await getEmailTemplate("interview_evaluated");
  if (!tpl) return 0;

  const link = await appUrl(`/interviews/${sessionId}`);
  const scoreStr = row.final_score != null ? `${Math.round(row.final_score)}%` : "—";
  const vars: Partial<Record<PlaceholderKey, string>> = {
    learner_name: row.candidate_name,
    course_name: "Interview",
    assignment_name: row.assessment_title,
    due_date: "—",
    current_score: scoreStr,
    retake_link: link,
  };
  const { subject, html } = renderTemplate({ subject: tpl.subject, bodyMd: tpl.body_md, vars });

  const { data: admins } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .in("role", ["admin", "trainer"]);

  const today = new Date().toISOString().slice(0, 10);
  let queued = 0;
  for (const admin of admins ?? []) {
    const email = await getUserEmail(supabaseAdmin, admin.user_id);
    if (!email) continue;
    const idem = `interview_evaluated:${sessionId}:${email}:${today}`;
    const messageId = globalThis.crypto?.randomUUID?.() ?? `${idem}-${Date.now()}`;
    try {
      await enqueueEmail("transactional_emails", {
        to: email,
        subject,
        html,
        label: "interview_evaluated",
        message_id: messageId,
        idempotency_key: idem,
        queued_at: new Date().toISOString(),
      });
      queued += 1;
    } catch (e) {
      console.warn("[email] interview_evaluated enqueue failed", e);
    }
  }
  return queued;
}
