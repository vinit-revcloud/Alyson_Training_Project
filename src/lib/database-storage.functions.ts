import { createServerFn } from "@tanstack/react-start";
import { requireAdminUserId } from "@/lib/auth-token.server";
import { getPgPool } from "@/lib/pg.server";

export interface DatabaseStorageStats {
  usedMb: number;
  limitMb: number;
  usedPct: number;
  warn: boolean;
}

const NEON_FREE_LIMIT_MB = 512;
const WARN_THRESHOLD_PCT = 75;

export const fetchDatabaseStorageStatsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<DatabaseStorageStats | null> => {
    await requireAdminUserId();
    const pool = getPgPool();
    try {
      const { rows } = await pool.query<{
        used_mb: string;
        limit_mb: string;
        used_pct: string;
      }>(`SELECT * FROM database_storage_stats()`);
      const row = rows[0];
      if (!row) return null;
      const usedPct = Number(row.used_pct);
      return {
        usedMb: Number(row.used_mb),
        limitMb: Number(row.limit_mb),
        usedPct,
        warn: usedPct >= WARN_THRESHOLD_PCT,
      };
    } catch {
      const { rows } = await pool.query<{ bytes: string }>(
        `SELECT pg_database_size(current_database())::text AS bytes`,
      );
      const usedBytes = Number(rows[0]?.bytes ?? 0);
      const usedMb = Math.round((usedBytes / 1024 / 1024) * 100) / 100;
      const usedPct = Math.round((usedMb / NEON_FREE_LIMIT_MB) * 1000) / 10;
      return {
        usedMb,
        limitMb: NEON_FREE_LIMIT_MB,
        usedPct,
        warn: usedPct >= WARN_THRESHOLD_PCT,
      };
    }
  },
);
