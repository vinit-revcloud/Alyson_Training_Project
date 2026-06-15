import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/neon/auth-middleware";
import { renderTemplate, type PlaceholderKey } from "./render";
import { getUserEmail } from "@/lib/user-email";

async function appUrl(path: string): Promise<string> {
  const { getServerConfig } = await import("@/lib/config.server");
  const base = getServerConfig().appBaseUrl.replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export type Audience = "learner" | "hr" | "ceo" | "admin";

interface SendInput {
  templateKey: string;
  assignmentId?: string | null;
  audience?: Audience;
  testRecipient?: string; // for "send test to me"
  overrideVars?: Partial<Record<PlaceholderKey, string>>;
}

async function resolveRecipients(
  supabaseAdmin: any,
  audience: Audience,
  learnerUserId?: string | null,
): Promise<{ email: string; user_id: string | null }[]> {
  if (audience === "learner") {
    if (!learnerUserId) return [];
    const email = await getUserEmail(supabaseAdmin, learnerUserId);
    return email ? [{ email, user_id: learnerUserId }] : [];
  }
  // HR/CEO/Admin -> users with that role
  const roleName = audience === "hr" ? "trainer" : audience === "ceo" ? "admin" : "admin";
  const { data: roleRows } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("role", roleName);
  const ids = (roleRows ?? []).map((r: { user_id: string }) => r.user_id);
  if (!ids.length) return [];
  const out: { email: string; user_id: string | null }[] = [];
  for (const id of ids) {
    const email = await getUserEmail(supabaseAdmin, id);
    if (email) out.push({ email, user_id: id });
  }
  return out;
}

async function loadAssignmentVars(
  supabaseAdmin: any,
  assignmentId: string,
): Promise<{ learnerUserId: string; vars: Partial<Record<PlaceholderKey, string>> }> {
  const { data: a } = await supabaseAdmin
    .from("assessment_assignments")
    .select("learner_user_id, assessment_id, course_id, due_at, last_attempt_id")
    .eq("id", assignmentId)
    .single();
  if (!a) throw new Error("assignment not found");
  const [{ data: ass }, { data: profile }, { data: course }] = await Promise.all([
    supabaseAdmin.from("assessments").select("title").eq("id", a.assessment_id).maybeSingle(),
    supabaseAdmin.from("profiles").select("display_name").eq("user_id", a.learner_user_id).maybeSingle(),
    a.course_id
      ? supabaseAdmin.from("courses").select("title").eq("id", a.course_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  let scoreStr: string | undefined;
  if (a.last_attempt_id) {
    const { data: att } = await supabaseAdmin
      .from("assessment_attempts")
      .select("score")
      .eq("id", a.last_attempt_id)
      .maybeSingle();
    if (att?.score != null) scoreStr = `${Math.round(att.score)}%`;
  }
  return {
    learnerUserId: a.learner_user_id,
    vars: {
      learner_name: profile?.display_name ?? "there",
      course_name: course?.title ?? "your course",
      assignment_name: ass?.title ?? "your assignment",
      due_date: a.due_at ? new Date(a.due_at).toLocaleDateString() : "soon",
      current_score: scoreStr ?? "—",
      retake_link: await appUrl(`/attempt/${assignmentId}`),
    },
  };
}

export const sendTemplatedEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: SendInput) => d)
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/neon/client.server");

    // authorize
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const allowed = (roles ?? []).some(
      (r: { role: string }) => r.role === "admin" || r.role === "trainer",
    );
    if (!allowed) throw new Error("Not authorized");

    // Load template
    const { data: tpl, error: te } = await supabaseAdmin
      .from("email_templates")
      .select("*")
      .eq("key", data.templateKey)
      .single();
    if (te || !tpl) throw new Error("template not found");

    const audience: Audience = (data.audience ?? tpl.audience) as Audience;

    // Resolve vars + recipients
    let vars: Partial<Record<PlaceholderKey, string>> = {};
    let learnerUserId: string | null = null;
    if (data.assignmentId) {
      const r = await loadAssignmentVars(supabaseAdmin, data.assignmentId);
      learnerUserId = r.learnerUserId;
      vars = r.vars;
    }
    vars = { ...vars, ...(data.overrideVars ?? {}) };

    const recipients = data.testRecipient
      ? [{ email: data.testRecipient, user_id: userId }]
      : await resolveRecipients(supabaseAdmin, audience, learnerUserId);

    if (!recipients.length) {
      return { ok: false, queued: 0, reason: "no recipients" };
    }

    const today = new Date().toISOString().slice(0, 10);
    let queued = 0;
    for (const rcpt of recipients) {
      const { subject, html } = renderTemplate({
        subject: tpl.subject,
        bodyMd: tpl.body_md,
        vars,
      });
      const idem = `${tpl.key}:${data.assignmentId ?? "adhoc"}:${rcpt.email}:${today}`;

      // Skip duplicates by idempotency_key
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
          assignment_id: data.assignmentId ?? null,
          template_key: tpl.key,
          audience,
          recipient_email: rcpt.email,
          subject,
          status: "pending",
          idempotency_key: idem,
        })
        .select("id")
        .single();

      // Enqueue for delivery via AWS SES (training.group@cintara.ai)
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
          .eq("id", log?.id ?? "");
        continue;
      }

      await supabaseAdmin
        .from("notification_log")
        .update({
          status: "queued",
          provider_message_id: messageId,
        })
        .eq("id", log?.id ?? "");
      queued += 1;
    }

    return { ok: true, queued };
  });
