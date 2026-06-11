import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/neon/auth-middleware";
import { sendTemplatedEmail } from "@/lib/email/send-template.functions";

type Scenario =
  | "assignment_sent"
  | "reminder_day_7"
  | "reminder_day_14"
  | "reminder_day_30"
  | "failure_retake"
  | "escalation_hr"
  | "escalation_ceo";

interface SimulateInput {
  scenario: Scenario;
  learnerEmail: string;
  learnerName?: string;
  assignmentTitle?: string;
  assignmentId?: string;
}

const SCENARIO_TEMPLATE: Record<Scenario, string> = {
  assignment_sent: "assignment_new",
  reminder_day_7: "escalation_day7",
  reminder_day_14: "escalation_day14",
  reminder_day_30: "escalation_day30",
  failure_retake: "failure_retake",
  escalation_hr: "escalation_day14",
  escalation_ceo: "escalation_day30",
};

export const simulateEmailScenario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: SimulateInput) => {
    if (!data?.scenario || !data?.learnerEmail) {
      throw new Error("scenario and learnerEmail are required");
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.learnerEmail)) {
      throw new Error("Invalid learnerEmail");
    }
    return data;
  })
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/neon/client.server");

    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const allowed = (roles ?? []).some(
      (r: { role: string }) => r.role === "admin" || r.role === "trainer",
    );
    if (!allowed) throw new Error("Not authorized");

    const templateKey = SCENARIO_TEMPLATE[data.scenario];
    const result = await sendTemplatedEmail({
      data: {
        templateKey,
        assignmentId: data.assignmentId ?? null,
        testRecipient: data.learnerEmail,
        overrideVars: {
          learner_name: data.learnerName ?? data.learnerEmail.split("@")[0],
          assignment_name: data.assignmentTitle ?? "Sample Assessment",
          course_name: "Sample Course",
          due_date: new Date(Date.now() + 14 * 86400_000).toLocaleDateString(),
          current_score: "54%",
          retake_link: `${process.env.APP_BASE_URL ?? "http://localhost:5173"}/learn`,
        },
      },
    });

    return { ok: result.ok, queued: result.queued ?? 0 };
  });
