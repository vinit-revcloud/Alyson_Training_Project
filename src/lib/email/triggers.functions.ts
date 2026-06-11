import { createServerFn } from "@tanstack/react-start";
import { requireDbAuth } from "@/integrations/neon/auth-middleware";
import { isEmailJobEnabled } from "@/lib/email/email-settings.server";
import { maybeProcessEmailQueue } from "@/lib/email/queue-process.server";

interface OnAssignedInput {
  assignmentId: string;
}

interface InviteEmailInput {
  inviteId: string;
  email: string;
  role: string;
  token: string;
}

export const onAssignmentCreated = createServerFn({ method: "POST" })
  .middleware([requireDbAuth])
  .inputValidator((d: OnAssignedInput) => d)
  .handler(async ({ data }) => {
    const { notifyNewAssignments } = await import("@/lib/email/assignment-notify.server");
    const queued = await notifyNewAssignments([data.assignmentId]);
    return { ok: true, queued };
  });

export const onFailureRetake = createServerFn({ method: "POST" })
  .middleware([requireDbAuth])
  .inputValidator((d: OnAssignedInput) => d)
  .handler(async ({ data }) => {
    if (!(await isEmailJobEnabled("failure_retake"))) {
      return { ok: true, queued: 0, skipped: true };
    }
    const { supabaseAdmin } = await import("@/integrations/neon/client.server");
    const { dispatch } = await import("./triggers.server");
    const queued = await dispatch(supabaseAdmin, {
      templateKey: "failure_retake",
      assignmentId: data.assignmentId,
      audiences: ["learner"],
      skipJobCheck: true,
    });
    await maybeProcessEmailQueue();
    return { ok: true, queued };
  });

export const onTestCompleted = createServerFn({ method: "POST" })
  .middleware([requireDbAuth])
  .inputValidator((d: OnAssignedInput) => d)
  .handler(async ({ data }) => {
    if (!(await isEmailJobEnabled("test_completed"))) {
      return { ok: true, queued: 0, skipped: true };
    }
    const { supabaseAdmin } = await import("@/integrations/neon/client.server");
    const { dispatch } = await import("./triggers.server");
    const queued = await dispatch(supabaseAdmin, {
      templateKey: "test_completed",
      assignmentId: data.assignmentId,
      audiences: ["hr", "ceo"],
      skipJobCheck: true,
    });
    await maybeProcessEmailQueue();
    return { ok: true, queued };
  });

export const onInviteCreated = createServerFn({ method: "POST" })
  .middleware([requireDbAuth])
  .inputValidator((d: InviteEmailInput) => d)
  .handler(async ({ data }) => {
    const { sendInviteEmail } = await import("./triggers.server");
    return sendInviteEmail(data);
  });
