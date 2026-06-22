import { createServerFn } from "@tanstack/react-start";
import { requireDbAuth } from "@/integrations/neon/auth-middleware";
import { requireAdminUserId } from "@/lib/auth-token.server";
import { getPgPool } from "@/lib/pg.server";
import type { UserMetrics } from "@/lib/users-metrics-api";

export const fetchUserMetricsMapFn = createServerFn({ method: "GET" })
  .middleware([requireDbAuth])
  .handler(async (): Promise<Record<string, UserMetrics>> => {
    await requireAdminUserId();
    const pool = getPgPool();
    const [assignmentsRes, attemptsRes, candidatesRes] = await Promise.all([
      pool.query<{ learner_user_id: string; status: string; due_at: string | null }>(
        `SELECT learner_user_id, status, due_at FROM assessment_assignments`,
      ),
      pool.query<{ candidate_id: string; score: number | null; passed: boolean | null; status: string }>(
        `SELECT candidate_id, score, passed, status FROM assessment_attempts`,
      ),
      pool.query<{ id: string; user_id: string }>(`SELECT id, user_id FROM candidates`),
    ]);

    const candUser = new Map(candidatesRes.rows.map((c) => [c.id, c.user_id]));
    const byUser = new Map<
      string,
      { total: number; passed: number; failed: number; overdue: number; scores: number[]; attempts: number }
    >();

    for (const a of assignmentsRes.rows) {
      const uid = a.learner_user_id;
      const cur = byUser.get(uid) ?? {
        total: 0,
        passed: 0,
        failed: 0,
        overdue: 0,
        scores: [],
        attempts: 0,
      };
      cur.total += 1;
      if (a.status === "passed") cur.passed += 1;
      if (a.status === "failed_capped" || a.status === "expired") cur.failed += 1;
      if (
        ["assigned", "in_progress"].includes(a.status) &&
        a.due_at &&
        new Date(a.due_at).getTime() < Date.now()
      ) {
        cur.overdue += 1;
      }
      byUser.set(uid, cur);
    }

    for (const att of attemptsRes.rows) {
      const uid = candUser.get(att.candidate_id);
      if (!uid) continue;
      const cur = byUser.get(uid);
      if (!cur) continue;
      if (att.status === "graded" && typeof att.score === "number") {
        cur.scores.push(att.score);
        cur.attempts += 1;
      }
    }

    const result: Record<string, UserMetrics> = {};
    for (const [uid, v] of byUser) {
      const completion = v.total ? Math.round(((v.passed + v.failed) / v.total) * 100) : 0;
      const avgScore = v.scores.length
        ? Math.round(v.scores.reduce((a, b) => a + b, 0) / v.scores.length)
        : 0;
      let status: UserMetrics["status"] = "Active";
      if (v.overdue >= 2 || avgScore < 60) status = "At Risk";
      else if (completion < 30 && v.total > 0) status = "Needs Attention";
      result[uid] = {
        completion,
        avgScore,
        modulesDone: v.passed,
        modulesTotal: v.total,
        quizzesTaken: v.attempts,
        overdue: v.overdue,
        status,
      };
    }
    return result;
  });
