import { dbAdmin } from "@/integrations/neon/client.server";
import { isEmailJobEnabled } from "@/lib/email/email-settings.server";
import { maybeProcessEmailQueue } from "@/lib/email/queue-process.server";

/** Queue assignment_new emails for newly created assignment rows. */
export async function notifyNewAssignments(assignmentIds: string[]): Promise<number> {
  if (!assignmentIds.length) return 0;
  if (!(await isEmailJobEnabled("assignment_new"))) return 0;

  const { dispatch } = await import("@/lib/email/triggers.server");
  let queued = 0;
  for (const assignmentId of assignmentIds) {
    queued += await dispatch(dbAdmin, {
      templateKey: "assignment_new",
      assignmentId,
      audiences: ["learner"],
    });
  }
  await maybeProcessEmailQueue();
  return queued;
}
