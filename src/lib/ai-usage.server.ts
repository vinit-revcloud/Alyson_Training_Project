import { getPgPool } from "@/lib/pg.server";

export interface AiUsageEntry {
  userId?: string | null;
  feature: string;
  model?: string;
  tokensIn?: number;
  tokensOut?: number;
  durationMs?: number;
  estimatedCostUsd?: number;
}

/** Rough per-1M-token pricing for executive dashboards (USD). */
const MODEL_COST_PER_1M: Record<string, { in: number; out: number }> = {
  "deepseek-chat": { in: 0.27, out: 1.1 },
  default: { in: 1.0, out: 3.0 },
};

export function estimateAiCostUsd(
  model: string | undefined,
  tokensIn: number,
  tokensOut: number,
): number {
  const rates = MODEL_COST_PER_1M[model ?? ""] ?? MODEL_COST_PER_1M.default;
  return (tokensIn / 1_000_000) * rates.in + (tokensOut / 1_000_000) * rates.out;
}

export async function logAiUsage(entry: AiUsageEntry): Promise<void> {
  try {
    const pool = getPgPool();
    const tokensIn = entry.tokensIn ?? 0;
    const tokensOut = entry.tokensOut ?? 0;
    const cost =
      entry.estimatedCostUsd ??
      estimateAiCostUsd(entry.model, tokensIn, tokensOut);
    await pool.query(
      `INSERT INTO ai_usage_log (user_id, feature, model, tokens_in, tokens_out, duration_ms, estimated_cost_usd)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        entry.userId ?? null,
        entry.feature,
        entry.model ?? null,
        tokensIn,
        tokensOut,
        entry.durationMs ?? 0,
        cost,
      ],
    );
  } catch (err) {
    console.warn("[ai-usage] log failed", err instanceof Error ? err.message : err);
  }
}

export interface AiUsageSummary {
  totalCalls: number;
  totalCostUsd: number;
  last30DaysCostUsd: number;
  byFeature: Array<{ feature: string; calls: number; costUsd: number }>;
}

export async function fetchAiUsageSummary(): Promise<AiUsageSummary> {
  const pool = getPgPool();
  const { rows: totals } = await pool.query<{
    total_calls: string;
    total_cost: string;
    last_30_cost: string;
  }>(
    `SELECT
       COUNT(*)::text AS total_calls,
       COALESCE(SUM(estimated_cost_usd), 0)::text AS total_cost,
       COALESCE(SUM(estimated_cost_usd) FILTER (WHERE created_at >= now() - interval '30 days'), 0)::text AS last_30_cost
     FROM ai_usage_log`,
  );
  const { rows: byFeature } = await pool.query<{
    feature: string;
    calls: string;
    cost_usd: string;
  }>(
    `SELECT feature, COUNT(*)::text AS calls, COALESCE(SUM(estimated_cost_usd), 0)::text AS cost_usd
     FROM ai_usage_log
     WHERE created_at >= now() - interval '30 days'
     GROUP BY feature
     ORDER BY SUM(estimated_cost_usd) DESC`,
  );
  const t = totals[0];
  return {
    totalCalls: Number(t?.total_calls ?? 0),
    totalCostUsd: Number(t?.total_cost ?? 0),
    last30DaysCostUsd: Number(t?.last_30_cost ?? 0),
    byFeature: byFeature.map((r) => ({
      feature: r.feature,
      calls: Number(r.calls),
      costUsd: Number(r.cost_usd),
    })),
  };
}
