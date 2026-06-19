import pg from "pg";

let pool: pg.Pool | undefined;

/** Serverless-safe pool size — use Neon pooler URL in production (DATABASE_URL with -pooler host). */
function poolMaxConnections(): number {
  const raw = process.env.PG_POOL_MAX?.trim();
  if (raw) {
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return process.env.VERCEL ? 2 : 5;
}

export function getPgPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is required for server-side database access");
    }
    pool = new pg.Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: poolMaxConnections(),
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    });
  }
  return pool;
}
