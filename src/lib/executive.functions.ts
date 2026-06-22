import { createServerFn } from "@tanstack/react-start";
import { requireHiringRead } from "@/integrations/neon/auth-middleware";
import { fetchAiUsageSummary } from "@/lib/ai-usage.server";
import { getPgPool } from "@/lib/pg.server";
import { fetchHiringFunnelMetrics } from "@/lib/hiring/hiring-reports.server";

export interface ExecutiveSummary {
  activeUsers7d: number;
  activeUsers30d: number;
  publishedClasses: number;
  inReviewClasses: number;
  assignmentCompletionRate: number;
  emailSuccessRate: number;
  ai: Awaited<ReturnType<typeof fetchAiUsageSummary>>;
  hiring: Awaited<ReturnType<typeof fetchHiringFunnelMetrics>>;
}

export const fetchExecutiveSummaryFn = createServerFn({ method: "GET" })
  .middleware([requireHiringRead])
  .handler(async (): Promise<ExecutiveSummary> => {
    const pool = getPgPool();
    const [usersRes, classesRes, assignRes, emailRes, ai, hiring] = await Promise.all([
      pool.query<{ active_7: string; active_30: string }>(
        `SELECT
           COUNT(*) FILTER (WHERE updated_at >= now() - interval '7 days')::text AS active_7,
           COUNT(*) FILTER (WHERE updated_at >= now() - interval '30 days')::text AS active_30
         FROM profiles WHERE status = 'active'`,
      ),
      pool.query<{ published: string; in_review: string }>(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'published')::text AS published,
           COUNT(*) FILTER (WHERE status = 'in-review')::text AS in_review
         FROM classes`,
      ),
      pool.query<{ total: string; completed: string }>(
        `SELECT
           COUNT(*)::text AS total,
           COUNT(*) FILTER (WHERE status = 'completed')::text AS completed
         FROM assessment_assignments`,
      ),
      (async () => {
        try {
          return await pool.query<{ sent: string; failed: string }>(
            `SELECT
               COUNT(*) FILTER (WHERE status = 'sent')::text AS sent,
               COUNT(*) FILTER (WHERE status IN ('failed', 'dlq'))::text AS failed
             FROM email_send_log
             WHERE created_at >= now() - interval '30 days'`,
          );
        } catch {
          return { rows: [{ sent: "0", failed: "0" }] };
        }
      })(),
      fetchAiUsageSummary(),
      fetchHiringFunnelMetrics(),
    ]);

    const u = usersRes.rows[0];
    const c = classesRes.rows[0];
    const a = assignRes.rows[0];
    const e = emailRes.rows[0];
    const totalAssign = Number(a?.total ?? 0);
    const completedAssign = Number(a?.completed ?? 0);
    const sent = Number(e?.sent ?? 0);
    const failed = Number(e?.failed ?? 0);
    const emailTotal = sent + failed;

    return {
      activeUsers7d: Number(u?.active_7 ?? 0),
      activeUsers30d: Number(u?.active_30 ?? 0),
      publishedClasses: Number(c?.published ?? 0),
      inReviewClasses: Number(c?.in_review ?? 0),
      assignmentCompletionRate:
        totalAssign > 0 ? Math.round((completedAssign / totalAssign) * 100) : 0,
      emailSuccessRate: emailTotal > 0 ? Math.round((sent / emailTotal) * 100) : 100,
      ai,
      hiring,
    };
  });
