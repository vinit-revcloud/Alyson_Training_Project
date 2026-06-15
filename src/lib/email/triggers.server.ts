import { renderTemplate, type PlaceholderKey } from "./render";
import { getUserEmail } from "@/lib/user-email";
import { isEmailJobEnabled, type EmailJobKey } from "@/lib/email/email-settings.server";
async function appUrl(path: string): Promise<string> {
  const { getServerConfig } = await import("@/lib/config.server");
  const base = getServerConfig().appBaseUrl.replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

const TEMPLATE_JOB: Partial<Record<string, EmailJobKey>> = {
  assignment_new: "assignment_new",
  reminder_daily: "reminder_daily",
  failure_retake: "failure_retake",
  test_completed: "test_completed",
  escalation_day7: "escalation",
  escalation_day14: "escalation",
  escalation_day30: "escalation",
};

export async function dispatch(
  supabaseAdmin: any,
  opts: {
    templateKey: string;
    assignmentId: string;
    audiences: ("learner" | "hr" | "ceo" | "admin")[];
    skipJobCheck?: boolean;
  },
): Promise<number> {
  const jobKey = TEMPLATE_JOB[opts.templateKey];
  if (!opts.skipJobCheck && jobKey && !(await isEmailJobEnabled(jobKey))) {
    return 0;
  }

  const { data: tpl } = await supabaseAdmin
    .from("email_templates")
    .select("*")
    .eq("key", opts.templateKey)
    .maybeSingle();
  if (!tpl) return 0;

  const { data: a } = await supabaseAdmin
    .from("assessment_assignments")
    .select("learner_user_id, assessment_id, course_id, due_at, last_attempt_id")
    .eq("id", opts.assignmentId)
    .maybeSingle();
  if (!a) return 0;

  const [{ data: ass }, { data: profile }, { data: course }] = await Promise.all([
    supabaseAdmin.from("assessments").select("title").eq("id", a.assessment_id).maybeSingle(),
    supabaseAdmin.from("profiles").select("display_name").eq("user_id", a.learner_user_id).maybeSingle(),
    a.course_id
      ? supabaseAdmin.from("courses").select("title").eq("id", a.course_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  let scoreStr = "—";
  if (a.last_attempt_id) {
    const { data: att } = await supabaseAdmin
      .from("assessment_attempts")
      .select("score")
      .eq("id", a.last_attempt_id)
      .maybeSingle();
    if (att?.score != null) scoreStr = `${Math.round(att.score)}%`;
  }

  const vars: Partial<Record<PlaceholderKey, string>> = {
    learner_name: profile?.display_name ?? "there",
    course_name: course?.title ?? "your course",
    assignment_name: ass?.title ?? "your assignment",
    due_date: a.due_at ? new Date(a.due_at).toLocaleDateString() : "soon",
    current_score: scoreStr,
    retake_link: await appUrl(`/attempt/${opts.assignmentId}`),
  };

  const today = new Date().toISOString().slice(0, 10);
  let queued = 0;

  for (const audience of opts.audiences) {
    let recipients: { email: string; user_id: string | null }[] = [];
    if (audience === "learner") {
      const email = await getUserEmail(supabaseAdmin, a.learner_user_id);
      if (email) recipients = [{ email, user_id: a.learner_user_id }];
    } else {
      const roleName = audience === "hr" ? "trainer" : "admin";
      const { data: roleRows } = await supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .eq("role", roleName);
      for (const r of roleRows ?? []) {
        const email = await getUserEmail(supabaseAdmin, r.user_id);
        if (email) recipients.push({ email, user_id: r.user_id });
      }
    }

    for (const rcpt of recipients) {
      const { subject, html } = renderTemplate({ subject: tpl.subject, bodyMd: tpl.body_md, vars });
      const idem = `${tpl.key}:${opts.assignmentId}:${rcpt.email}:${today}`;
      const { data: existing } = await supabaseAdmin
        .from("notification_log")
        .select("id")
        .eq("idempotency_key", idem)
        .maybeSingle();
      if (existing) continue;

      const { data: log } = await supabaseAdmin
        .from("notification_log")
        .insert({
          user_id: rcpt.user_id,
          assignment_id: opts.assignmentId,
          template_key: tpl.key,
          audience,
          recipient_email: rcpt.email,
          subject,
          status: "pending",
          idempotency_key: idem,
        })
        .select("id")
        .single();

      const messageId =
        (globalThis.crypto?.randomUUID?.() as string | undefined) ??
        `${log?.id ?? idem}-${Date.now()}`;

      const { error: enqErr } = await supabaseAdmin.rpc("enqueue_email", {
        queue_name: "transactional_emails",
        payload: {
          to: rcpt.email,
          subject,
          html,
          label: tpl.key,
          message_id: messageId,
          idempotency_key: idem,
          queued_at: new Date().toISOString(),
        },
      });

      if (enqErr) {
        await supabaseAdmin
          .from("notification_log")
          .update({ status: "failed", error: enqErr.message })
          .eq("id", log?.id);
        continue;
      }

      await supabaseAdmin
        .from("notification_log")
        .update({ status: "queued", provider_message_id: messageId })
        .eq("id", log?.id);
      queued += 1;
    }
  }

  return queued;
}

async function loadJob(jobKey: string): Promise<{ enabled: boolean; config: Record<string, unknown> } | null> {
  const { getPgPool } = await import("@/lib/pg.server");
  const pool = getPgPool();
  const { rows } = await pool.query<{ enabled: boolean; config: Record<string, unknown> }>(
    `SELECT enabled, config FROM notification_schedules WHERE job_key = $1`,
    [jobKey],
  );
  return rows[0] ?? null;
}

async function recordRun(jobKey: string, queued: number): Promise<void> {
  const { getPgPool } = await import("@/lib/pg.server");
  const pool = getPgPool();
  await pool.query(
    `UPDATE notification_schedules
     SET last_run_at = now(), last_run_queued = $2, updated_at = now()
     WHERE job_key = $1`,
    [jobKey, queued],
  );
}

export async function runDailyReminders(): Promise<{ queued: number }> {
  const job = await loadJob("reminder_daily");
  if (job && !job.enabled) return { queued: 0 };
  const dueWithinDays =
    typeof job?.config?.only_when_due_within_days === "number"
      ? job.config.only_when_due_within_days
      : null;

  const { supabaseAdmin } = await import("@/integrations/neon/client.server");
  const { data: rows } = await supabaseAdmin
    .from("assessment_assignments")
    .select("id, due_at, status")
    .in("status", ["assigned", "in_progress"])
    .gt("due_at", new Date().toISOString());
  let queued = 0;
  const now = Date.now();
  for (const r of rows ?? []) {
    if (dueWithinDays != null && r.due_at) {
      const daysLeft = (new Date(r.due_at).getTime() - now) / 86_400_000;
      if (daysLeft > dueWithinDays) continue;
    }
    queued += await dispatch(supabaseAdmin, {
      templateKey: "reminder_daily",
      assignmentId: r.id,
      audiences: ["learner"],
      skipJobCheck: true,
    });
  }
  await recordRun("reminder_daily", queued);
  return { queued };
}

function daysOverdue(dueIso: string | null): number {
  if (!dueIso) return 0;
  return Math.floor((Date.now() - new Date(dueIso).getTime()) / 86_400_000);
}

interface EscalationTier {
  days: number;
  audiences: ("learner" | "hr" | "ceo" | "admin")[];
}

const DEFAULT_TIERS: EscalationTier[] = [
  { days: 7, audiences: ["learner"] },
  { days: 14, audiences: ["learner", "hr"] },
  { days: 30, audiences: ["learner", "hr", "ceo", "admin"] },
];

function templateKeyForTier(days: number): string {
  if (days >= 30) return "escalation_day30";
  if (days >= 14) return "escalation_day14";
  return "escalation_day7";
}

export async function runEscalations(): Promise<{
  queued: number;
  paused: number;
  deactivated: number;
}> {
  const job = await loadJob("escalation");
  if (job && !job.enabled) return { queued: 0, paused: 0, deactivated: 0 };
  const tiers: EscalationTier[] = (job?.config?.tiers as EscalationTier[]) ?? DEFAULT_TIERS;
  const maxTierDays = Math.max(...tiers.map((t) => t.days));

  const { supabaseAdmin } = await import("@/integrations/neon/client.server");
  const { data: rows } = await supabaseAdmin
    .from("assessment_assignments")
    .select("id, learner_user_id, due_at, status, paused_at")
    .in("status", ["assigned", "in_progress", "expired"]);
  let queued = 0;
  let paused = 0;
  let deactivated = 0;

  for (const r of rows ?? []) {
    const d = daysOverdue(r.due_at);
    const tier =
      tiers.find((t) => t.days === d) ??
      (d >= maxTierDays ? tiers.find((t) => t.days === maxTierDays) : undefined);
    if (!tier) continue;

    queued += await dispatch(supabaseAdmin, {
      templateKey: templateKeyForTier(tier.days),
      assignmentId: r.id,
      audiences: tier.audiences,
    });

    if (tier.days >= 30 && !r.paused_at) {
      await supabaseAdmin
        .from("assessment_assignments")
        .update({
          paused_at: new Date().toISOString(),
          paused_reason: "30d-overdue",
          status: "expired",
        })
        .eq("id", r.id);
      paused += 1;

      const { count } = await supabaseAdmin
        .from("assessment_assignments")
        .select("id", { count: "exact", head: true })
        .eq("learner_user_id", r.learner_user_id)
        .not("paused_at", "is", null);
      if ((count ?? 0) >= 2) {
        await supabaseAdmin
          .from("profiles")
          .update({ status: "inactive" })
          .eq("user_id", r.learner_user_id);
        deactivated += 1;
      }
    }
  }

  await recordRun("escalation", queued);
  return { queued, paused, deactivated };
}

export async function runWeeklyCeoSummary(): Promise<{ queued: number }> {
  if (!(await isEmailJobEnabled("weekly_ceo_summary"))) return { queued: 0 };

  const { supabaseAdmin } = await import("@/integrations/neon/client.server");
  const { data: tpl } = await supabaseAdmin
    .from("email_templates")
    .select("*")
    .eq("key", "weekly_ceo_summary")
    .maybeSingle();
  if (!tpl) return { queued: 0 };

  const [{ count: total }, { count: passed }, { count: pending }] = await Promise.all([
    supabaseAdmin.from("assessment_assignments").select("id", { count: "exact", head: true }),
    supabaseAdmin
      .from("assessment_assignments")
      .select("id", { count: "exact", head: true })
      .eq("status", "passed"),
    supabaseAdmin
      .from("assessment_assignments")
      .select("id", { count: "exact", head: true })
      .in("status", ["assigned", "in_progress"]),
  ]);

  const completionPct = total ? Math.round(((passed ?? 0) / (total ?? 1)) * 100) : 0;
  const vars: Partial<Record<PlaceholderKey, string>> = {
    learner_name: "Leadership",
    course_name: "All courses",
    assignment_name: "Weekly training summary",
    due_date: new Date().toLocaleDateString(),
    current_score: `${completionPct}% complete · ${pending ?? 0} pending`,
    retake_link: await appUrl("/analytics"),
  };
  const { subject, html } = renderTemplate({
    subject: tpl.subject,
    bodyMd: tpl.body_md,
    vars,
  });

  const { data: admins } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin");

  const today = new Date().toISOString().slice(0, 10);
  let queued = 0;
  for (const admin of admins ?? []) {
    const email = await getUserEmail(supabaseAdmin, admin.user_id);
    if (!email) continue;
    const idem = `weekly_ceo_summary:${email}:${today}`;
    const messageId = globalThis.crypto?.randomUUID?.() ?? `${idem}-${Date.now()}`;
    const { error: enqErr } = await supabaseAdmin.rpc("enqueue_email", {
      queue_name: "transactional_emails",
      payload: {
        to: email,
        subject,
        html,
        label: "weekly_ceo_summary",
        message_id: messageId,
        idempotency_key: idem,
        queued_at: new Date().toISOString(),
      },
    });
    if (!enqErr) queued += 1;
  }

  await recordRun("weekly_ceo_summary", queued);
  return { queued };
}

export async function runRetryFailed(): Promise<{ retried: number }> {
  const { supabaseAdmin } = await import("@/integrations/neon/client.server");
  const { data: rows } = await supabaseAdmin
    .from("notification_log")
    .select("id, assignment_id, template_key, audience, attempt")
    .eq("status", "failed")
    .lt("attempt", 3);
  let retried = 0;
  for (const r of rows ?? []) {
    if (!r.assignment_id) continue;
    const queued = await dispatch(supabaseAdmin, {
      templateKey: r.template_key,
      assignmentId: r.assignment_id,
      audiences: [r.audience as "learner" | "hr" | "ceo" | "admin"],
    });
    if (queued > 0) {
      await supabaseAdmin
        .from("notification_log")
        .update({ attempt: (r.attempt ?? 0) + 1, status: "queued" })
        .eq("id", r.id);
      retried += 1;
    }
  }
  return { retried };
}

export async function sendInviteEmail(data: {
  inviteId: string;
  email: string;
  role: string;
  token: string;
}): Promise<{ ok: boolean; queued: number; error?: string; processed?: number }> {
  const {
    enqueueEmail,
    findNotificationLogByIdempotency,
    getEmailTemplate,
    insertNotificationLog,
    updateNotificationLog,
  } = await import("@/lib/email/email-db.server");

  const tpl = await getEmailTemplate("invite_new");
  if (!tpl) {
    return { ok: false, queued: 0, error: "invite_new email template not found in database" };
  }

  const signupLink = await appUrl(
    `/auth?email=${encodeURIComponent(data.email)}&mode=signup&token=${data.token}`,
  );
  const vars: Partial<Record<PlaceholderKey, string>> = {
    learner_name: data.email.split("@")[0],
    course_name: "Alyson Training",
    assignment_name: `Workspace access (${data.role})`,
    due_date: "—",
    current_score: "—",
    retake_link: signupLink,
  };
  const { subject, html } = renderTemplate({
    subject: tpl.subject,
    bodyMd: tpl.body_md,
    vars,
  });
  const today = new Date().toISOString().slice(0, 10);
  const idem = `invite_new:${data.inviteId}:${data.email}:${today}`;
  const messageId = globalThis.crypto?.randomUUID?.() ?? `${idem}-${Date.now()}`;

  const existing = await findNotificationLogByIdempotency(idem);
  if (existing) {
    return { ok: true, queued: 0 };
  }

  const logId = await insertNotificationLog({
    template_key: "invite_new",
    audience: "learner",
    recipient_email: data.email,
    subject,
    status: "pending",
    idempotency_key: idem,
  });

  try {
    await enqueueEmail("transactional_emails", {
      to: data.email,
      subject,
      html,
      label: "invite_new",
      message_id: messageId,
      idempotency_key: idem,
      queued_at: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await updateNotificationLog(logId, { status: "failed", error: msg });
    return { ok: false, queued: 0, error: msg };
  }

  await updateNotificationLog(logId, { status: "queued", provider_message_id: messageId });
  let processed = 0;
  if (process.env.EMAIL_AUTO_PROCESS === "1") {
    const { processEmailQueue } = await import("@/lib/email/process-queue");
    try {
      const result = await processEmailQueue();
      processed = result.processed;
    } catch (err) {
      console.warn("[email] invite dev auto-process failed", err);
    }
  }
  return { ok: true, queued: 1, processed };
}
