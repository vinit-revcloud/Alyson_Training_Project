import { isEmailJobEnabled } from "@/lib/email/email-settings.server";
import { enqueueAssignmentEmailInDb } from "@/lib/email/enqueue-assignment-email.server";
import { getPgPool } from "@/lib/pg.server";

/** Queue initial assignment emails for newly created assignment rows. */
export async function notifyNewAssignments(assignmentIds: string[]): Promise<number> {
  if (!assignmentIds.length) return 0;
  if (!(await isEmailJobEnabled("assignment_new"))) return 0;

  const pool = getPgPool();
  let queued = 0;

  for (const assignmentId of assignmentIds) {
    const { rows } = await pool.query<{ learner_user_id: string }>(
      `SELECT learner_user_id FROM assessment_assignments WHERE id = $1 LIMIT 1`,
      [assignmentId],
    );
    const userId = rows[0]?.learner_user_id;
    if (!userId) continue;

    const result = await enqueueAssignmentEmailInDb({
      user_id: userId,
      assignment_id: assignmentId,
      email_type: "initial",
    });

    if (result.ok && result.queued) {
      queued += 1;
    }
  }

  if (assignmentIds.length > 0) {
    console.info(
      `[email] notifyNewAssignments: ${queued} queued of ${assignmentIds.length} assignment(s)`,
    );
  }

  return queued;
}

/** Queue retake email after a failed attempt when retries remain. */
export async function notifyRetakeAssignment(assignmentId: string): Promise<number> {
  if (!(await isEmailJobEnabled("failure_retake"))) return 0;

  const pool = getPgPool();
  const { rows } = await pool.query<{
    learner_user_id: string;
    status: string;
    attempts_used: number;
    max_attempts: number;
  }>(
    `SELECT learner_user_id, status, attempts_used, max_attempts
     FROM assessment_assignments WHERE id = $1 LIMIT 1`,
    [assignmentId],
  );

  const row = rows[0];
  if (!row) return 0;

  if (row.status === "passed" || row.status === "failed_capped") return 0;
  if (row.attempts_used >= row.max_attempts) return 0;

  const result = await enqueueAssignmentEmailInDb({
    user_id: row.learner_user_id,
    assignment_id: assignmentId,
    email_type: "retake",
  });

  const queued = result.ok && result.queued ? 1 : 0;
  console.info(
    `[email] notifyRetakeAssignment: assignment=${assignmentId} queued=${queued} status=${row.status} attempts=${row.attempts_used}/${row.max_attempts}`,
  );
  return queued;
}
