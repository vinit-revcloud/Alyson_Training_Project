import { getPgPool } from "@/lib/pg.server";
import { STAGE_LABELS } from "@/lib/hiring-pipeline/hiring-pipeline.shared";
import type { PipelineStage } from "@/lib/hiring-pipeline/hiring-pipeline.shared";

export interface Learner360Path {
  courseId: string;
  courseTitle: string;
  assignmentType: string;
  status: string;
  progressPct: number;
}

export interface Learner360Assessment {
  id: string;
  assessmentTitle: string;
  status: string;
  dueAt: string | null;
  score: number | null;
  passed: boolean | null;
}

export interface Learner360Policy {
  id: string;
  title: string;
  version: number;
  acknowledged: boolean;
  acknowledgedAt: string | null;
}

export interface Learner360Data {
  userId: string;
  displayName: string | null;
  email: string | null;
  department: string | null;
  roles: string[];
  pipelineStage: string | null;
  pipelineStageLabel: string | null;
  pipelineId: string | null;
  onboardingPct: number;
  paths: Learner360Path[];
  assessments: Learner360Assessment[];
  trialSubmitted: boolean | null;
  trialDueAt: string | null;
  policies: Learner360Policy[];
  pendingPolicies: number;
}

async function sectionProgressPct(userId: string): Promise<number> {
  const pool = getPgPool();
  const { rows } = await pool.query<{ pct: string }>(
    `WITH published AS (
       SELECT s.id
       FROM sections s
       JOIN classes c ON c.id = s.class_id
       JOIN courses co ON co.id = c.course_id
       WHERE co.status = 'published' AND c.status = 'published'
         AND (
           co.is_core_onboarding = true
           OR co.id IN (
             SELECT course_id FROM course_departments cd
             JOIN profiles p ON p.department = cd.department
             WHERE p.user_id = $1
           )
         )
     ),
     done AS (
       SELECT DISTINCT lip.section_id
       FROM learner_item_progress lip
       WHERE lip.user_id = $1 AND lip.section_id IS NOT NULL
     )
     SELECT CASE WHEN COUNT(published.*) = 0 THEN 0
            ELSE ROUND(100.0 * (SELECT COUNT(*) FROM done WHERE section_id IN (SELECT id FROM published))
                 / COUNT(published.*))::int END AS pct
     FROM published`,
    [userId],
  );
  return Number(rows[0]?.pct ?? 0);
}

export async function getLearner360FromDb(userId: string): Promise<Learner360Data | null> {
  const pool = getPgPool();

  const profileRes = await pool.query<{
    user_id: string;
    display_name: string | null;
    email: string | null;
    department: string | null;
  }>(`SELECT user_id, display_name, email, department FROM profiles WHERE user_id = $1`, [userId]);
  const profile = profileRes.rows[0];
  if (!profile) return null;

  const [rolesRes, pipelineRes, pathsRes, assessRes, trialRes, policiesRes, pendingRes] =
    await Promise.all([
      pool.query<{ role: string }>(`SELECT role FROM user_roles WHERE user_id = $1`, [userId]),
      pool.query<{ id: string; current_stage: PipelineStage }>(
        `SELECT id, current_stage FROM hiring_pipelines
         WHERE user_id = $1 AND status = 'active' ORDER BY updated_at DESC LIMIT 1`,
        [userId],
      ),
      pool.query<{
        course_id: string;
        title: string;
        assignment_type: string;
        status: string;
      }>(
        `SELECT lpa.course_id, c.title, lpa.assignment_type, lpa.status
         FROM learner_path_assignments lpa
         JOIN courses c ON c.id = lpa.course_id
         WHERE lpa.user_id = $1
         ORDER BY lpa.assignment_type, c.title`,
        [userId],
      ),
      pool.query<{
        id: string;
        title: string;
        status: string;
        due_at: string | null;
        score: number | null;
        passed: boolean | null;
      }>(
        `SELECT aa.id, a.title, aa.status, aa.due_at, att.score, att.passed
         FROM assessment_assignments aa
         JOIN assessments a ON a.id = aa.assessment_id
         LEFT JOIN assessment_attempts att ON att.id = aa.last_attempt_id
         WHERE aa.learner_user_id = $1
         ORDER BY aa.assigned_at DESC
         LIMIT 20`,
        [userId],
      ),
      pool.query<{ submitted_at: string | null; due_at: string | null }>(
        `SELECT t.submitted_at, t.due_at FROM trial_projects t
         JOIN hiring_pipelines p ON p.id = t.pipeline_id
         WHERE p.user_id = $1 AND p.status = 'active'
         ORDER BY t.created_at DESC LIMIT 1`,
        [userId],
      ),
      pool.query<{
        id: string;
        title: string;
        version: number;
        acknowledged_at: string | null;
        acknowledged_version: number | null;
      }>(
        `SELECT p.id, p.title, p.version, a.acknowledged_at, a.policy_version AS acknowledged_version
         FROM policy_documents p
         LEFT JOIN policy_acknowledgements a
           ON a.policy_document_id = p.id AND a.user_id = $1
         WHERE p.status = 'published'
         ORDER BY p.sort_order, p.title`,
        [userId],
      ),
      pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM policy_documents p
         WHERE p.status = 'published' AND p.requires_acknowledgement = true
           AND NOT EXISTS (
             SELECT 1 FROM policy_acknowledgements a
             WHERE a.policy_document_id = p.id AND a.user_id = $1
               AND a.policy_version >= p.version
           )`,
        [userId],
      ),
    ]);

  const onboardingPct = await sectionProgressPct(userId);
  const pipeline = pipelineRes.rows[0];
  const stage = pipeline?.current_stage ?? null;

  const paths: Learner360Path[] = await Promise.all(
    pathsRes.rows.map(async (row) => {
      const { rows } = await pool.query<{ pct: string }>(
        `WITH secs AS (
           SELECT s.id FROM sections s
           JOIN classes c ON c.id = s.class_id
           WHERE c.course_id = $2 AND c.status = 'published'
         ),
         done AS (
           SELECT section_id FROM learner_item_progress
           WHERE user_id = $1 AND section_id IN (SELECT id FROM secs)
         )
         SELECT CASE WHEN COUNT(secs.*) = 0 THEN 0
                ELSE ROUND(100.0 * (SELECT COUNT(*) FROM done) / COUNT(secs.*))::int END AS pct
         FROM secs`,
        [userId, row.course_id],
      );
      return {
        courseId: row.course_id,
        courseTitle: row.title,
        assignmentType: row.assignment_type,
        status: row.status,
        progressPct: Number(rows[0]?.pct ?? 0),
      };
    }),
  );

  return {
    userId: profile.user_id,
    displayName: profile.display_name,
    email: profile.email,
    department: profile.department,
    roles: rolesRes.rows.map((r) => r.role),
    pipelineStage: stage,
    pipelineStageLabel: stage ? STAGE_LABELS[stage] : null,
    pipelineId: pipeline?.id ?? null,
    onboardingPct,
    paths,
    assessments: assessRes.rows.map((a) => ({
      id: a.id,
      assessmentTitle: a.title,
      status: a.status,
      dueAt: a.due_at,
      score: a.score,
      passed: a.passed,
    })),
    trialSubmitted: trialRes.rows[0] ? trialRes.rows[0].submitted_at != null : null,
    trialDueAt: trialRes.rows[0]?.due_at ?? null,
    policies: policiesRes.rows.map((p) => ({
      id: p.id,
      title: p.title,
      version: p.version,
      acknowledged:
        p.acknowledged_at != null && (p.acknowledged_version ?? 0) >= p.version,
      acknowledgedAt: p.acknowledged_at,
    })),
    pendingPolicies: Number(pendingRes.rows[0]?.count ?? 0),
  };
}

export async function listUserPolicyAckStatusFromDb(
  userIds: string[],
): Promise<Map<string, { pending: number; total: number }>> {
  const pool = getPgPool();
  const map = new Map<string, { pending: number; total: number }>();
  if (!userIds.length) return map;

  const { rows } = await pool.query<{
    user_id: string;
    pending: string;
    total: string;
  }>(
    `SELECT u.user_id,
            COUNT(p.id) FILTER (
              WHERE p.requires_acknowledgement AND (
                a.id IS NULL OR a.policy_version < p.version
              )
            )::text AS pending,
            COUNT(p.id)::text AS total
     FROM unnest($1::uuid[]) AS u(user_id)
     CROSS JOIN policy_documents p
     LEFT JOIN policy_acknowledgements a
       ON a.policy_document_id = p.id AND a.user_id = u.user_id
     WHERE p.status = 'published'
     GROUP BY u.user_id`,
    [userIds],
  );
  for (const row of rows) {
    map.set(row.user_id, {
      pending: Number(row.pending),
      total: Number(row.total),
    });
  }
  return map;
}
