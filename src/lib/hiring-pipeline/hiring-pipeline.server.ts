import type { PoolClient } from "pg";
import { getPgPool } from "@/lib/pg.server";
import { notifyTrialSubmitted } from "@/lib/onboarding/onboarding-notify.server";
import { createInviteRecord } from "@/lib/invites.server";
import {
  generateInterviewToken,
  hashInterviewToken,
} from "@/lib/interview/interview-token.server";
import { snapshotAssessmentVersion } from "@/lib/interview/assessment-version.server";
import type {
  InterviewRoundType,
  PipelineListItem,
  PipelineStage,
  PipelineStatus,
  StageStatus,
} from "./hiring-pipeline.shared";
import { nextStageAfterPass } from "./hiring-pipeline.shared";

export type {
  PipelineListItem,
  PipelineRow,
  PipelineStageRow,
  TrialProjectRow,
} from "./hiring-pipeline.shared";

const STAGE_SEEDS: PipelineStage[] = [
  "tech_round_1",
  "tech_round_2",
  "trial_project",
  "bill_review",
  "ceo_interview",
  "onboarding",
];

export async function createPipelineInDb(input: {
  candidateName: string;
  candidateEmail: string;
  targetRole: string;
  targetDepartment: string;
  createdBy: string;
}): Promise<PipelineRow> {
  const pool = getPgPool();
  const email = input.candidateEmail.trim().toLowerCase();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await client.query<{ id: string }>(
      `SELECT id FROM candidates WHERE lower(email) = $1 LIMIT 1`,
      [email],
    );
    let candidateId = existing.rows[0]?.id;
    if (!candidateId) {
      const ins = await client.query<{ id: string }>(
        `INSERT INTO candidates (user_id, name, email) VALUES (NULL, $1, $2) RETURNING id`,
        [input.candidateName.trim(), email],
      );
      candidateId = ins.rows[0].id;
    }

    const pipe = await client.query<PipelineRow>(
      `INSERT INTO hiring_pipelines (
         candidate_id, target_role, target_department, created_by
       ) VALUES ($1, $2, $3, $4) RETURNING *`,
      [candidateId, input.targetRole, input.targetDepartment, input.createdBy],
    );
    const pipeline = pipe.rows[0];

    for (const stage of STAGE_SEEDS) {
      await client.query(
        `INSERT INTO pipeline_stages (pipeline_id, stage, status)
         VALUES ($1, $2, $3)
         ON CONFLICT (pipeline_id, stage) DO NOTHING`,
        [pipeline.id, stage, stage === "tech_round_1" ? "pending" : "pending"],
      );
    }

    await client.query("COMMIT");
    return pipeline;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function listPipelinesFromDb(): Promise<PipelineListItem[]> {
  const pool = getPgPool();
  const { rows } = await pool.query<PipelineListItem>(
    `SELECT p.*, c.name AS candidate_name, c.email AS candidate_email,
            (
              SELECT CASE WHEN total_secs = 0 THEN NULL
                     ELSE ROUND(100.0 * done_secs / total_secs)::int END
              FROM (
                SELECT
                  (SELECT COUNT(DISTINCT s.id)
                   FROM sections s
                   JOIN classes c ON c.id = s.class_id
                   JOIN courses co ON co.id = c.course_id
                   WHERE c.status = 'published' AND co.status = 'published'
                     AND (co.is_core_onboarding = true
                       OR co.id IN (
                         SELECT course_id FROM course_departments cd
                         WHERE cd.department = p.target_department
                       ))
                  ) AS total_secs,
                  (SELECT COUNT(DISTINCT lip.section_id)
                   FROM learner_item_progress lip
                   JOIN sections s ON s.id = lip.section_id
                   JOIN classes c ON c.id = s.class_id
                   JOIN courses co ON co.id = c.course_id
                   WHERE lip.user_id = p.user_id
                     AND c.status = 'published' AND co.status = 'published'
                     AND (co.is_core_onboarding = true
                       OR co.id IN (
                         SELECT course_id FROM course_departments cd
                         WHERE cd.department = p.target_department
                       ))
                  ) AS done_secs
              ) x
            ) AS onboarding_pct
     FROM hiring_pipelines p
     JOIN candidates c ON c.id = p.candidate_id
     ORDER BY p.updated_at DESC`,
  );
  return rows;
}

export async function getPipelineDetailFromDb(pipelineId: string) {
  const pool = getPgPool();
  const pipeRes = await pool.query<PipelineListItem>(
    `SELECT p.*, c.name AS candidate_name, c.email AS candidate_email,
            NULL::int AS onboarding_pct
     FROM hiring_pipelines p
     JOIN candidates c ON c.id = p.candidate_id
     WHERE p.id = $1`,
    [pipelineId],
  );
  const pipeline = pipeRes.rows[0];
  if (!pipeline) return null;

  const [stagesRes, trialRes, sessionsRes] = await Promise.all([
    pool.query<PipelineStageRow>(
      `SELECT * FROM pipeline_stages WHERE pipeline_id = $1 ORDER BY created_at`,
      [pipelineId],
    ),
    pool.query<TrialProjectRow>(`SELECT * FROM trial_projects WHERE pipeline_id = $1`, [
      pipelineId,
    ]),
    pool.query<{
      id: string;
      round_type: string | null;
      status: string;
      final_score: number | null;
      final_recommendation: string | null;
      scheduled_at: string;
    }>(
      `SELECT id, round_type, status, final_score, final_recommendation, scheduled_at
       FROM interview_sessions WHERE pipeline_id = $1 ORDER BY scheduled_at`,
      [pipelineId],
    ),
  ]);

  return {
    pipeline,
    stages: stagesRes.rows,
    trialProject: trialRes.rows[0] ?? null,
    interviewSessions: sessionsRes.rows,
  };
}

export async function schedulePipelineInterviewInDb(input: {
  pipelineId: string;
  assessmentId: string;
  roundType: InterviewRoundType;
  scheduledAt: string;
  expiresAt: string;
  createdBy: string;
  assessmentMode?: "online" | "paper_only" | "hybrid";
}): Promise<{ sessionId: string; rawToken: string }> {
  const pool = getPgPool();
  const rawToken = generateInterviewToken();
  const tokenHash = hashInterviewToken(rawToken);
  const versionId = await snapshotAssessmentVersion(input.assessmentId, input.createdBy);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const pipeRes = await client.query<{
      candidate_id: string;
      target_role: string;
      current_stage: PipelineStage;
    }>(`SELECT candidate_id, target_role, current_stage FROM hiring_pipelines WHERE id = $1`, [
      input.pipelineId,
    ]);
    const pipe = pipeRes.rows[0];
    if (!pipe) throw new Error("Pipeline not found");

    const candRes = await client.query<{ name: string; email: string }>(
      `SELECT name, email FROM candidates WHERE id = $1`,
      [pipe.candidate_id],
    );
    const cand = candRes.rows[0];
    if (!cand) throw new Error("Candidate not found");

    const sess = await client.query<{ id: string }>(
      `INSERT INTO interview_sessions (
         assessment_id, assessment_version_id, assessment_mode, candidate_id,
         candidate_name, candidate_email, role, level, scheduled_at, expires_at,
         access_token_hash, created_by, pipeline_id, round_type
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,'Mid',$8,$9,$10,$11,$12,$13)
       RETURNING id`,
      [
        input.assessmentId,
        versionId,
        input.assessmentMode ?? "online",
        pipe.candidate_id,
        cand.name,
        cand.email,
        pipe.target_role,
        input.scheduledAt,
        input.expiresAt,
        tokenHash,
        input.createdBy,
        input.pipelineId,
        input.roundType,
      ],
    );
    const sessionId = sess.rows[0].id;

    await client.query(
      `UPDATE pipeline_stages
       SET status = 'scheduled', interview_session_id = $3, updated_at = now()
       WHERE pipeline_id = $1 AND stage = $2`,
      [input.pipelineId, input.roundType, sessionId],
    );

    await client.query(
      `UPDATE hiring_pipelines SET current_stage = $2, updated_at = now() WHERE id = $1`,
      [input.pipelineId, input.roundType],
    );

    await client.query("COMMIT");
    return { sessionId, rawToken };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function passPipelineStageInDb(input: {
  pipelineId: string;
  stage: PipelineStage;
  reviewerUserId: string;
  notes?: string;
}): Promise<PipelineRow> {
  const pool = getPgPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `UPDATE pipeline_stages
       SET status = 'passed', reviewer_user_id = $3, notes = $4,
           completed_at = now(), updated_at = now()
       WHERE pipeline_id = $1 AND stage = $2`,
      [input.pipelineId, input.stage, input.reviewerUserId, input.notes ?? null],
    );

    const next = nextStageAfterPass(input.stage);
    const { rows } = await client.query<PipelineRow>(
      `UPDATE hiring_pipelines
       SET current_stage = $2, updated_at = now()
       WHERE id = $1 RETURNING *`,
      [input.pipelineId, next ?? "completed"],
    );

    await client.query("COMMIT");
    return rows[0];
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function createTrialProjectInDb(input: {
  pipelineId: string;
  title: string;
  brief?: string;
  teamContext?: string;
  estimatedHours?: number;
  platformAccess?: string[];
  dueAt?: string;
}): Promise<TrialProjectRow> {
  const pool = getPgPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const trial = await client.query<TrialProjectRow>(
      `INSERT INTO trial_projects (
         pipeline_id, title, brief, team_context, estimated_hours, platform_access, due_at
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
       ON CONFLICT (pipeline_id) DO UPDATE SET
         title = EXCLUDED.title,
         brief = EXCLUDED.brief,
         team_context = EXCLUDED.team_context,
         estimated_hours = EXCLUDED.estimated_hours,
         platform_access = EXCLUDED.platform_access,
         due_at = EXCLUDED.due_at,
         updated_at = now()
       RETURNING *`,
      [
        input.pipelineId,
        input.title,
        input.brief ?? null,
        input.teamContext ?? null,
        input.estimatedHours ?? 20,
        JSON.stringify(input.platformAccess ?? []),
        input.dueAt ?? null,
      ],
    );

    await client.query(
      `UPDATE pipeline_stages
       SET status = 'in_progress', trial_project_id = $3, updated_at = now()
       WHERE pipeline_id = $1 AND stage = 'trial_project'`,
      [input.pipelineId, "trial_project", trial.rows[0].id],
    );

    await client.query(
      `UPDATE hiring_pipelines SET current_stage = 'trial_project', updated_at = now() WHERE id = $1`,
      [input.pipelineId],
    );

    await client.query("COMMIT");
    return trial.rows[0];
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function sendCandidateInviteForPipelineInDb(input: {
  pipelineId: string;
  invitedBy: string;
}): Promise<{ inviteUrl: string; email: string }> {
  const pool = getPgPool();
  const { rows } = await pool.query<{ email: string; target_department: string }>(
    `SELECT c.email, p.target_department
     FROM hiring_pipelines p
     JOIN candidates c ON c.id = p.candidate_id
     WHERE p.id = $1`,
    [input.pipelineId],
  );
  const row = rows[0];
  if (!row) throw new Error("Pipeline not found");

  const invite = await createInviteRecord({
    email: row.email,
    role: "candidate",
    department: row.target_department,
    invitedBy: input.invitedBy,
    pipelineId: input.pipelineId,
  });

  const { sendInviteEmail } = await import("@/lib/email/triggers.server");
  const emailResult = await sendInviteEmail({
    inviteId: invite.id,
    email: invite.email,
    role: invite.role,
    token: invite.token,
  });
  if (!emailResult.ok) {
    throw new Error(emailResult.error ?? "Failed to queue candidate invite email");
  }

  const { getServerConfig } = await import("@/lib/config.server");
  const origin = getServerConfig().appBaseUrl.replace(/\/$/, "");
  const { buildInviteUrl } = await import("@/lib/invites.server");
  return { inviteUrl: buildInviteUrl(origin, invite), email: row.email };
}

/** Post-trial CEO review decision (DB columns remain `bill_review_*` for schema compatibility). */
export async function recordCeoReviewInDb(input: {
  pipelineId: string;
  status: "scheduled" | "passed" | "failed";
  notes?: string;
  reviewerUserId: string;
}): Promise<void> {
  const pool = getPgPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `UPDATE trial_projects SET bill_review_status = $2, bill_notes = $3, updated_at = now()
       WHERE pipeline_id = $1`,
      [input.pipelineId, input.status, input.notes ?? null],
    );

    const stageStatus = input.status === "passed" ? "passed" : input.status === "failed" ? "failed" : "in_progress";
    await client.query(
      `UPDATE pipeline_stages
       SET status = $3, reviewer_user_id = $4, notes = $5,
           completed_at = CASE WHEN $3 IN ('passed','failed') THEN now() ELSE NULL END,
           updated_at = now()
       WHERE pipeline_id = $1 AND stage = 'bill_review'`,
      [input.pipelineId, "bill_review", stageStatus, input.reviewerUserId, input.notes ?? null],
    );

    if (input.status === "passed") {
      await client.query(
        `UPDATE hiring_pipelines SET current_stage = 'ceo_interview', updated_at = now() WHERE id = $1`,
        [input.pipelineId],
      );
    }

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function convertPipelineToTraineeInDb(input: {
  pipelineId: string;
  reviewerUserId: string;
}): Promise<void> {
  const pool = getPgPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const pipeRes = await client.query<{
      user_id: string | null;
      candidate_id: string;
      target_department: string;
    }>(`SELECT user_id, candidate_id, target_department FROM hiring_pipelines WHERE id = $1`, [
      input.pipelineId,
    ]);
    const pipe = pipeRes.rows[0];
    if (!pipe?.user_id) throw new Error("Candidate must accept workspace invite before hire conversion");

    await client.query(
      `UPDATE user_roles SET role = 'trainee' WHERE user_id = $1 AND role = 'candidate'`,
      [pipe.user_id],
    );
    await client.query(
      `INSERT INTO user_roles (user_id, role) VALUES ($1, 'trainee')
       ON CONFLICT (user_id, role) DO NOTHING`,
      [pipe.user_id],
    );

    await client.query(
      `UPDATE hiring_pipelines
       SET status = 'hired', current_stage = 'onboarding', hired_at = now(), updated_at = now()
       WHERE id = $1`,
      [input.pipelineId],
    );

    await client.query(
      `UPDATE pipeline_stages
       SET status = 'passed', reviewer_user_id = $3, completed_at = now(), updated_at = now()
       WHERE pipeline_id = $1 AND stage = 'ceo_interview'`,
      [input.pipelineId, "ceo_interview", input.reviewerUserId],
    );

    await enrollOnboardingTx(client, pipe.user_id, input.pipelineId, pipe.target_department);

    await client.query("COMMIT");
    const { notifyPolicyAckRequired } = await import("@/lib/onboarding/onboarding-notify.server");
    await notifyPolicyAckRequired(pipe.user_id);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function rejectPipelineInDb(input: {
  pipelineId: string;
  reviewerUserId: string;
  notes?: string;
}): Promise<void> {
  const pool = getPgPool();
  await pool.query(
    `UPDATE hiring_pipelines SET status = 'rejected', updated_at = now() WHERE id = $1`,
    [input.pipelineId],
  );
  const pipeRes = await pool.query<{ user_id: string | null }>(
    `SELECT user_id FROM hiring_pipelines WHERE id = $1`,
    [input.pipelineId],
  );
  const userId = pipeRes.rows[0]?.user_id;
  if (userId) {
    await pool.query(`UPDATE profiles SET status = 'suspended' WHERE user_id = $1`, [userId]);
  }
}

/** Called from auth bootstrap when candidate/trainee accepts invite. */
export async function linkPipelineOnBootstrap(
  client: PoolClient,
  input: { userId: string; email: string; pipelineId?: string | null; department: string | null },
): Promise<void> {
  let pipelineId = input.pipelineId;
  if (!pipelineId) {
    const res = await client.query<{ id: string }>(
      `SELECT hp.id FROM hiring_pipelines hp
       JOIN candidates c ON c.id = hp.candidate_id
       WHERE lower(c.email) = lower($1) AND hp.status = 'active'
       ORDER BY hp.created_at DESC LIMIT 1`,
      [input.email],
    );
    pipelineId = res.rows[0]?.id;
  }
  if (!pipelineId) return;

  await client.query(
    `UPDATE hiring_pipelines SET user_id = $2, updated_at = now() WHERE id = $1`,
    [pipelineId, input.userId],
  );
  await client.query(`UPDATE candidates SET user_id = $2 WHERE id = (
    SELECT candidate_id FROM hiring_pipelines WHERE id = $1
  )`, [pipelineId, input.userId]);

  const deptRes = await client.query<{ target_department: string; target_role: string }>(
    `SELECT target_department, target_role FROM hiring_pipelines WHERE id = $1`,
    [pipelineId],
  );
  const dept = input.department ?? deptRes.rows[0]?.target_department;
  const targetRole = deptRes.rows[0]?.target_role;
  if (dept) {
    await client.query(`UPDATE profiles SET department = $2 WHERE user_id = $1`, [
      input.userId,
      dept,
    ]);
    await client.query(
      `UPDATE candidates SET department = $2, role = COALESCE(NULLIF(role, ''), $3)
       WHERE id = (SELECT candidate_id FROM hiring_pipelines WHERE id = $1)`,
      [pipelineId, dept, targetRole ?? ""],
    );
    await enrollOnboardingTx(client, input.userId, pipelineId, dept);
  }
}

async function enrollOnboardingTx(
  client: PoolClient,
  userId: string,
  pipelineId: string,
  department: string,
): Promise<void> {
  await client.query(
    `INSERT INTO onboarding_enrollments (user_id, pipeline_id, track_department)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, pipeline_id) DO NOTHING`,
    [userId, pipelineId, department],
  );
  await client.query(`SELECT public.auto_enroll_onboarding($1, $2, $3)`, [
    userId,
    department,
    pipelineId,
  ]);
}

/** After interview AI evaluation, advance linked pipeline when recommendation passes. */
export async function maybeAdvancePipelineFromInterviewEval(sessionId: string): Promise<void> {
  const pool = getPgPool();
  const { rows } = await pool.query<{
    pipeline_id: string | null;
    round_type: string | null;
    final_recommendation: string | null;
    created_by: string | null;
  }>(
    `SELECT pipeline_id, round_type, final_recommendation, created_by
     FROM interview_sessions WHERE id = $1`,
    [sessionId],
  );
  const session = rows[0];
  if (!session?.pipeline_id || !session.round_type) return;

  const rec = session.final_recommendation ?? "";
  const passed = rec === "strong_hire" || rec === "hire" || rec === "borderline";
  if (!passed) return;

  const stage = session.round_type as PipelineStage;
  const validStages: PipelineStage[] = [
    "tech_round_1",
    "tech_round_2",
    "ceo_interview",
  ];
  if (!validStages.includes(stage)) return;

  const reviewer = session.created_by;
  if (!reviewer) return;

  await passPipelineStageInDb({
    pipelineId: session.pipeline_id,
    stage,
    reviewerUserId: reviewer,
    notes: `Auto-advanced after interview evaluation (${rec})`,
  });
}

export async function getTrialProjectForUserInDb(userId: string): Promise<TrialProjectRow | null> {
  const pool = getPgPool();
  const { rows } = await pool.query<TrialProjectRow>(
    `SELECT t.* FROM trial_projects t
     JOIN hiring_pipelines p ON p.id = t.pipeline_id
     WHERE p.user_id = $1 AND p.status = 'active'
     ORDER BY t.created_at DESC LIMIT 1`,
    [userId],
  );
  return rows[0] ?? null;
}

export async function submitTrialProjectInDb(input: {
  userId: string;
  submissionNotes: string;
}): Promise<void> {
  const pool = getPgPool();
  await pool.query(
    `UPDATE trial_projects t
     SET submitted_at = now(), submission_notes = $2, updated_at = now()
     FROM hiring_pipelines p
     WHERE t.pipeline_id = p.id AND p.user_id = $1 AND p.status = 'active'`,
    [input.userId, input.submissionNotes],
  );
  await pool.query(
    `UPDATE pipeline_stages ps
     SET status = 'completed', completed_at = now(), updated_at = now()
     FROM hiring_pipelines p
     WHERE ps.pipeline_id = p.id AND p.user_id = $1
       AND ps.stage = 'trial_project' AND p.status = 'active'`,
    [input.userId],
  );
  await pool.query(
    `UPDATE hiring_pipelines SET current_stage = 'bill_review', updated_at = now()
     WHERE user_id = $1 AND status = 'active'`,
    [input.userId],
  );

  const nameRes = await pool.query<{ display_name: string | null; candidate_name: string }>(
    `SELECT pr.display_name, c.name AS candidate_name
     FROM hiring_pipelines p
     JOIN candidates c ON c.id = p.candidate_id
     LEFT JOIN profiles pr ON pr.user_id = p.user_id
     WHERE p.user_id = $1 AND p.status = 'active' LIMIT 1`,
    [input.userId],
  );
  const pipelineRes = await pool.query<{ id: string }>(
    `SELECT id FROM hiring_pipelines WHERE user_id = $1 AND status = 'active' LIMIT 1`,
    [input.userId],
  );
  const nm = nameRes.rows[0];
  const pid = pipelineRes.rows[0]?.id;
  if (pid && nm) {
    await notifyTrialSubmitted(pid, nm.display_name ?? nm.candidate_name);
  }
}
