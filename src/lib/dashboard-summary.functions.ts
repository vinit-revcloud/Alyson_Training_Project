import { createServerFn } from "@tanstack/react-start";
import { requireHiringRead } from "@/integrations/neon/auth-middleware";
import { getAssignmentMetricsFromDb } from "@/lib/assignments.server";
import { getPgPool } from "@/lib/pg.server";
import type { DashboardSummary } from "@/lib/dashboard-summary-api";

export const fetchDashboardSummaryFn = createServerFn({ method: "GET" })
  .middleware([requireHiringRead])
  .handler(async (): Promise<DashboardSummary> => {
    const pool = getPgPool();
    const [metrics, userCountRes, courseCountRes] = await Promise.all([
      getAssignmentMetricsFromDb(),
      pool.query<{ count: string }>(`SELECT count(*)::text AS count FROM profiles`),
      pool.query<{ count: string }>(`SELECT count(*)::text AS count FROM courses`),
    ]);

    const userCount = Number(userCountRes.rows[0]?.count ?? 0);
    const courseCount = Number(courseCountRes.rows[0]?.count ?? 0);

    return {
      totalUsers: userCount,
      activeAssignments: metrics.assigned + metrics.in_progress,
      completedAssignments: metrics.passed,
      avgCompletionPct: metrics.completionPct,
      overdueCount: metrics.expired + metrics.assigned,
      activeCourses: courseCount,
    };
  });
