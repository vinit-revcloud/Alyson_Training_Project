import { getPgPool } from "@/lib/pg.server";

export interface HiringFunnelMetrics {
  total: number;
  scheduled: number;
  inProgress: number;
  submitted: number;
  evaluating: number;
  evaluated: number;
  cancelled: number;
  expired: number;
  strongHire: number;
  hire: number;
  borderline: number;
  noHire: number;
  avgAiScore: number | null;
  proctoringIncidents: number;
  byRole: { role: string; count: number; avgScore: number | null }[];
}

export async function fetchHiringFunnelMetrics(): Promise<HiringFunnelMetrics> {
  const pool = getPgPool();

  const [statusRes, recRes, scoreRes, roleRes, proctorRes] = await Promise.all([
    pool.query<{ status: string; n: number }>(
      `SELECT status, count(*)::int AS n FROM interview_sessions GROUP BY status`,
    ),
    pool.query<{ final_recommendation: string; n: number }>(
      `SELECT final_recommendation, count(*)::int AS n
       FROM interview_sessions WHERE final_recommendation IS NOT NULL
       GROUP BY final_recommendation`,
    ),
    pool.query<{ avg: string | null }>(
      `SELECT round(avg(final_score)::numeric, 1)::text AS avg
       FROM interview_sessions WHERE final_score IS NOT NULL`,
    ),
    pool.query<{ role: string; n: number; avg: string | null }>(
      `SELECT role, count(*)::int AS n,
              round(avg(final_score)::numeric, 1)::text AS avg
       FROM interview_sessions
       GROUP BY role ORDER BY n DESC`,
    ),
    pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM interview_sessions
       WHERE jsonb_array_length(COALESCE(interview_events, '[]'::jsonb)) > 0
         AND (
           interview_events::text ILIKE '%tab_hidden%'
           OR interview_events::text ILIKE '%fullscreen_exit%'
           OR interview_events::text ILIKE '%page_reload%'
         )`,
    ),
  ]);

  const statusMap = new Map(statusRes.rows.map((r) => [r.status, r.n]));
  const recMap = new Map(recRes.rows.map((r) => [r.final_recommendation, r.n]));

  const total = [...statusMap.values()].reduce((s, n) => s + n, 0);

  return {
    total,
    scheduled: statusMap.get("scheduled") ?? 0,
    inProgress: (statusMap.get("in_progress") ?? 0) + (statusMap.get("opened") ?? 0) + (statusMap.get("waiting") ?? 0),
    submitted: statusMap.get("submitted") ?? 0,
    evaluating: statusMap.get("evaluating") ?? 0,
    evaluated: statusMap.get("evaluated") ?? 0,
    cancelled: statusMap.get("cancelled") ?? 0,
    expired: statusMap.get("expired") ?? 0,
    strongHire: recMap.get("strong_hire") ?? 0,
    hire: recMap.get("hire") ?? 0,
    borderline: recMap.get("borderline") ?? 0,
    noHire: recMap.get("no_hire") ?? 0,
    avgAiScore: scoreRes.rows[0]?.avg != null ? Number(scoreRes.rows[0].avg) : null,
    proctoringIncidents: proctorRes.rows[0]?.n ?? 0,
    byRole: roleRes.rows.map((r) => ({
      role: r.role || "Unspecified",
      count: r.n,
      avgScore: r.avg != null ? Number(r.avg) : null,
    })),
  };
}

export interface CandidateReportRow {
  id: string;
  candidate_name: string;
  candidate_email: string;
  role: string;
  level: string;
  status: string;
  assessment_title: string;
  final_score: number | null;
  final_recommendation: string | null;
  scheduled_at: string;
  evaluation_runs: number;
  proctor_events: number;
}

async function hasEvaluationRunsTable(pool: ReturnType<typeof getPgPool>): Promise<boolean> {
  const { rows } = await pool.query<{ exists: boolean }>(
    `SELECT to_regclass('public.interview_evaluation_runs') IS NOT NULL AS exists`,
  );
  return rows[0]?.exists ?? false;
}

export async function fetchCandidateReportRows(): Promise<CandidateReportRow[]> {
  const pool = getPgPool();
  const hasEvalRuns = await hasEvaluationRunsTable(pool);
  const evalRunsExpr = hasEvalRuns
    ? `(SELECT count(*)::int FROM interview_evaluation_runs r WHERE r.session_id = s.id)`
    : `0`;

  const { rows } = await pool.query<
    CandidateReportRow & { evaluation_runs: number; proctor_events: number; final_score: string | null }
  >(
    `SELECT s.id, s.candidate_name, s.candidate_email, s.role, s.level, s.status,
            a.title AS assessment_title, s.final_score, s.final_recommendation,
            s.scheduled_at::text,
            ${evalRunsExpr} AS evaluation_runs,
            jsonb_array_length(COALESCE(s.interview_events, '[]'::jsonb))::int AS proctor_events
     FROM interview_sessions s
     JOIN assessments a ON a.id = s.assessment_id
     ORDER BY s.scheduled_at DESC
     LIMIT 200`,
  );
  return rows.map((r) => ({
    ...r,
    final_score: r.final_score != null ? Number(r.final_score) : null,
    evaluation_runs: Number(r.evaluation_runs ?? 0),
    proctor_events: Number(r.proctor_events ?? 0),
  }));
}
