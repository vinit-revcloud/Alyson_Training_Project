import { getPgPool } from "@/lib/pg.server";
import type { DashboardActivityItem, DashboardMetrics } from "@/lib/dashboard-metrics";
import { STAGE_LABELS } from "@/lib/hiring-pipeline/hiring-pipeline.shared";

const DAY_KEYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function dayKey(iso: string): string {
  const d = new Date(iso);
  return DAY_KEYS[(d.getDay() + 6) % 7];
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export async function fetchDashboardMetricsFromDb(): Promise<DashboardMetrics> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
  const pool = getPgPool();

  const [
    profilesRes,
    assignmentsRes,
    attemptsRes,
    candidatesRes,
    questionsRes,
    assessmentsRes,
    flagsRes,
    activityRes,
    recentProfilesRes,
    recentAssignsRes,
    recentAttemptsRes,
  ] = await Promise.all([
    pool.query(`SELECT user_id, display_name, department, created_at FROM profiles`),
    pool.query(
      `SELECT learner_user_id, status, due_at, last_attempt_id, assigned_at FROM assessment_assignments`,
    ),
    pool.query(
      `SELECT id, candidate_id, assessment_id, score, passed, submitted_at, status FROM assessment_attempts`,
    ),
    pool.query(`SELECT id, user_id FROM candidates`),
    pool.query(`SELECT id, prompt, assessment_id FROM assessment_questions`),
    pool.query(`SELECT id, title FROM assessments`),
    pool.query(`SELECT question_id, resolved FROM question_flags`),
    pool.query(
      `SELECT user_id, seconds_spent, created_at FROM study_activity WHERE created_at >= $1`,
      [weekAgo],
    ),
    pool.query(
      `SELECT display_name, department, created_at FROM profiles
       WHERE created_at >= $1 ORDER BY created_at DESC LIMIT 5`,
      [weekAgo],
    ),
    pool.query(
      `SELECT assigned_at, learner_user_id, assessment_id FROM assessment_assignments
       WHERE assigned_at >= $1 ORDER BY assigned_at DESC LIMIT 5`,
      [weekAgo],
    ),
    pool.query(
      `SELECT submitted_at, score, passed, candidate_id, assessment_id FROM assessment_attempts
       WHERE status = 'graded' AND submitted_at >= $1 ORDER BY submitted_at DESC LIMIT 5`,
      [weekAgo],
    ),
  ]);

  const profiles = profilesRes.rows;
  const assignments = assignmentsRes.rows;
  const attempts = attemptsRes.rows;
  const candidates = candidatesRes.rows;
  const questions = questionsRes.rows;
  const assessments = assessmentsRes.rows;
  const flags = flagsRes.rows;
  const activity = activityRes.rows;
  const recentProfiles = recentProfilesRes.rows;
  const recentAssigns = recentAssignsRes.rows;
  const recentAttempts = recentAttemptsRes.rows;

  const profileMap = new Map(
    (profiles ?? []).map((p: any) => [
      p.user_id as string,
      {
        name: (p.display_name as string) ?? "—",
        department: (p.department as string) ?? "—",
      },
    ]),
  );
  const candUser = new Map(
    (candidates ?? []).map((c: any) => [c.id as string, c.user_id as string]),
  );
  const assessmentTitle = new Map(
    (assessments ?? []).map((a: any) => [a.id as string, a.title as string]),
  );
  const questionMap = new Map(
    (questions ?? []).map((q: any) => [
      q.id as string,
      { prompt: q.prompt as string, assessmentId: q.assessment_id as string | null },
    ]),
  );

  const now = Date.now();
  const byUser = new Map<string, { overdue: number; pending: number; total: number; done: number }>();
  const statusCounts = {
    assigned: 0,
    in_progress: 0,
    passed: 0,
    failed_capped: 0,
    expired: 0,
  };

  for (const a of (assignments ?? []) as any[]) {
    const u = a.learner_user_id as string;
    const entry = byUser.get(u) ?? { overdue: 0, pending: 0, total: 0, done: 0 };
    entry.total += 1;
    const st = a.status as keyof typeof statusCounts;
    if (st in statusCounts) statusCounts[st] += 1;
    if (a.status === "passed" || a.status === "failed_capped") entry.done += 1;
    if (a.status === "assigned" || a.status === "in_progress") {
      entry.pending += 1;
      if (new Date(a.due_at).getTime() < now) entry.overdue += 1;
    }
    byUser.set(u, entry);
  }

  const atRisk: AtRiskLearner[] = Array.from(byUser.entries())
    .map(([userId, v]) => ({
      userId,
      name: profileMap.get(userId)?.name ?? "—",
      department: profileMap.get(userId)?.department ?? "—",
      overdue: v.overdue,
      pending: v.pending,
      progressPct: v.total ? Math.round((v.done / v.total) * 100) : 0,
    }))
    .filter((r) => r.overdue > 0 || (r.pending > 0 && r.progressPct < 40))
    .sort((a, b) => b.overdue - a.overdue || a.progressPct - b.progressPct)
    .slice(0, 6);

  const scoresByUser = new Map<string, number[]>();
  const scoreByDay = new Map<string, { sum: number; n: number }>();
  const completedByDay = new Map<string, number>();

  for (const att of (attempts ?? []) as any[]) {
    if (typeof att.score === "number") {
      const uid = candUser.get(att.candidate_id);
      if (uid) {
        const arr = scoresByUser.get(uid) ?? [];
        arr.push(att.score);
        scoresByUser.set(uid, arr);
      }
      if (att.submitted_at) {
        const key = dayKey(att.submitted_at);
        const e = scoreByDay.get(key) ?? { sum: 0, n: 0 };
        e.sum += att.score;
        e.n += 1;
        scoreByDay.set(key, e);
        if (att.passed) {
          completedByDay.set(key, (completedByDay.get(key) ?? 0) + 1);
        }
      }
    }
  }

  const topPerformers: TopPerformer[] = Array.from(scoresByUser.entries())
    .map(([userId, arr]) => ({
      userId,
      name: profileMap.get(userId)?.name ?? "—",
      department: profileMap.get(userId)?.department ?? "—",
      avgScore: Math.round(arr.reduce((s, x) => s + x, 0) / arr.length),
      attempts: arr.length,
    }))
    .sort((a, b) => b.avgScore - a.avgScore)
    .slice(0, 5);

  const flagCounts = new Map<string, number>();
  for (const f of (flags ?? []) as any[]) {
    if (f.resolved) continue;
    flagCounts.set(f.question_id, (flagCounts.get(f.question_id) ?? 0) + 1);
  }
  const flaggedQuestions: FlaggedQuestion[] = Array.from(flagCounts.entries())
    .map(([questionId, count]) => ({
      questionId,
      prompt: questionMap.get(questionId)?.prompt ?? "(question removed)",
      assessmentId: questionMap.get(questionId)?.assessmentId ?? null,
      flags: count,
    }))
    .sort((a, b) => b.flags - a.flags)
    .slice(0, 5);

  const byAssess = new Map<string, number[]>();
  for (const att of (attempts ?? []) as any[]) {
    if (typeof att.score !== "number") continue;
    const arr = byAssess.get(att.assessment_id) ?? [];
    arr.push(att.score);
    byAssess.set(att.assessment_id, arr);
  }
  const easyTests: EasyTest[] = Array.from(byAssess.entries())
    .map(([assessmentId, scores]) => {
      const avg = scores.reduce((s, x) => s + x, 0) / scores.length;
      const perfect = scores.filter((s) => s >= 100).length;
      return {
        assessmentId,
        title: assessmentTitle.get(assessmentId) ?? "Untitled test",
        attempts: scores.length,
        avgScore: Math.round(avg),
        perfectPct: Math.round((perfect / scores.length) * 100),
      };
    })
    .filter((t) => t.attempts >= 3 && (t.avgScore >= 95 || t.perfectPct >= 90))
    .sort((a, b) => b.avgScore - a.avgScore)
    .slice(0, 5);

  const trendMap = new Map<string, { cards: number; seconds: number; learners: Set<string> }>();
  let totalCards = 0;
  let totalSeconds = 0;
  const learnerSet = new Set<string>();
  for (const ev of (activity ?? []) as any[]) {
    totalCards += 1;
    totalSeconds += ev.seconds_spent ?? 0;
    learnerSet.add(ev.user_id);
    const key = dayKey(ev.created_at);
    const e = trendMap.get(key) ?? { cards: 0, seconds: 0, learners: new Set() };
    e.cards += 1;
    e.seconds += ev.seconds_spent ?? 0;
    e.learners.add(ev.user_id);
    trendMap.set(key, e);
  }

  const progressTrend = DAY_KEYS.map((day) => ({
    day,
    active: trendMap.get(day)?.learners.size ?? 0,
    completed: completedByDay.get(day) ?? 0,
  }));

  const scoreTrend = DAY_KEYS.map((day) => {
    const e = scoreByDay.get(day);
    return { day, score: e ? Math.round(e.sum / e.n) : 0 };
  }).map((d, i, arr) => ({
    ...d,
    score: d.score || (arr[i - 1]?.score ?? 0),
  }));

  const deptCounts = new Map<string, number>();
  const deptProgress = new Map<string, { sum: number; n: number }>();
  for (const p of (profiles ?? []) as any[]) {
    const dept = (p.department as string) || "Unassigned";
    deptCounts.set(dept, (deptCounts.get(dept) ?? 0) + 1);
  }
  for (const [userId, v] of byUser) {
    const dept = profileMap.get(userId)?.department ?? "Unassigned";
    const cur = deptProgress.get(dept) ?? { sum: 0, n: 0 };
    cur.sum += v.total ? (v.done / v.total) * 100 : 0;
    cur.n += 1;
    deptProgress.set(dept, cur);
  }

  const learnersByDepartment = Array.from(deptCounts.entries())
    .map(([department, learners]) => ({ department, learners }))
    .sort((a, b) => b.learners - a.learners);

  const completionByDept = Array.from(deptProgress.entries()).map(([name, v]) => ({
    name,
    value: v.n ? Math.round(v.sum / v.n) : 0,
  }));

  const assignmentStatus = [
    { name: "Assigned", count: statusCounts.assigned },
    { name: "In Progress", count: statusCounts.in_progress },
    { name: "Completed", count: statusCounts.passed },
    { name: "Overdue", count: statusCounts.expired },
    { name: "Failed", count: statusCounts.failed_capped },
  ];

  const upcomingDeadlines: UpcomingDeadline[] = ((assignments ?? []) as any[])
    .filter(
      (a) =>
        (a.status === "assigned" || a.status === "in_progress") &&
        new Date(a.due_at).getTime() > now,
    )
    .map((a) => {
      const uid = a.learner_user_id as string;
      const dueMs = new Date(a.due_at).getTime();
      const v = byUser.get(uid);
      return {
        userId: uid,
        name: profileMap.get(uid)?.name ?? "—",
        department: profileMap.get(uid)?.department ?? "—",
        progressPct: v?.total ? Math.round((v.done / v.total) * 100) : 0,
        dueAt: a.due_at as string,
        daysLeft: Math.max(0, Math.ceil((dueMs - now) / 86_400_000)),
      };
    })
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 6);

  type RawActivity = { at: string; title: string; detail: string; kind: string; iconKey: DashboardActivityItem["iconKey"] };
  const rawActivity: RawActivity[] = [];

  for (const p of (recentProfiles ?? []) as any[]) {
    rawActivity.push({
      at: p.created_at,
      title: "New user added",
      detail: `${p.display_name ?? "User"} joined ${p.department ?? "workspace"}`,
      kind: "user",
      iconKey: "user",
    });
  }
  for (const a of (recentAssigns ?? []) as any[]) {
    const uid = a.learner_user_id as string;
    rawActivity.push({
      at: a.assigned_at,
      title: "Test assigned",
      detail: `${profileMap.get(uid)?.name ?? "Learner"} · ${assessmentTitle.get(a.assessment_id) ?? "Assessment"}`,
      kind: "assign",
      iconKey: "assign",
    });
  }
  for (const att of (recentAttempts ?? []) as any[]) {
    const uid = candUser.get(att.candidate_id);
    const name = uid ? profileMap.get(uid)?.name ?? "Learner" : "Learner";
    const title = assessmentTitle.get(att.assessment_id) ?? "Test";
    const iconKey: DashboardActivityItem["iconKey"] =
      att.passed === false && typeof att.score === "number" && att.score < 60 ? "alert" : "test";
    rawActivity.push({
      at: att.submitted_at,
      title: att.passed ? "Test passed" : "Test completed",
      detail: `${name} · ${att.score ?? "—"}% on ${title}`,
      kind: "test",
      iconKey,
    });
  }

  const recentActivity: DashboardActivityItem[] = rawActivity
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 6)
    .map((r) => ({
      kind: r.kind,
      title: r.title,
      detail: r.detail,
      time: relativeTime(r.at),
      iconKey: r.iconKey,
    }));

  let pipelineByStage: { stage: string; label: string; count: number }[] = [];
  let overdueLearners = 0;
  let onboardingTrackCompletion: { department: string; completed: number; total: number }[] = [];

  try {
    const [pipelineStageRes, overdueRes, trackRes] = await Promise.all([
      pool.query<{ current_stage: string; count: string }>(
        `SELECT current_stage, COUNT(*)::text AS count
         FROM hiring_pipelines WHERE status = 'active'
         GROUP BY current_stage`,
      ),
      pool.query<{ count: string }>(
        `SELECT COUNT(DISTINCT learner_user_id)::text AS count
         FROM assessment_assignments
         WHERE due_at < now() AND status NOT IN ('passed', 'expired')`,
      ),
      pool.query<{ department: string; completed: string; total: string }>(
        `SELECT oe.track_department AS department,
                COUNT(*) FILTER (WHERE lpa.status = 'completed')::text AS completed,
                COUNT(*)::text AS total
         FROM onboarding_enrollments oe
         LEFT JOIN learner_path_assignments lpa
           ON lpa.user_id = oe.user_id AND lpa.assignment_type = 'role_track'
         GROUP BY oe.track_department`,
      ),
    ]);

    pipelineByStage = pipelineStageRes.rows.map((r) => ({
      stage: r.current_stage,
      label: STAGE_LABELS[r.current_stage as keyof typeof STAGE_LABELS] ?? r.current_stage,
      count: Number(r.count),
    }));
    overdueLearners = Number(overdueRes.rows[0]?.count ?? 0);
    onboardingTrackCompletion = trackRes.rows.map((r) => ({
      department: r.department,
      completed: Number(r.completed),
      total: Number(r.total),
    }));
  } catch (err) {
    console.warn("[dashboard-metrics] hiring/onboarding widgets unavailable:", err);
  }

  return {
    atRisk,
    topPerformers,
    flaggedQuestions,
    easyTests,
    studyEffort: {
      totalCardsRead: totalCards,
      avgSecondsPerCard: totalCards ? Math.round(totalSeconds / totalCards) : 0,
      totalLearners: learnerSet.size,
      trend: DAY_KEYS.map((day) => ({
        day,
        cards: trendMap.get(day)?.cards ?? 0,
        seconds: trendMap.get(day)?.seconds ?? 0,
      })),
    },
    progressTrend,
    scoreTrend,
    assignmentStatus,
    learnersByDepartment,
    completionByDept,
    recentActivity,
    upcomingDeadlines,
    pipelineByStage,
    overdueLearners,
    onboardingTrackCompletion,
  };
}
