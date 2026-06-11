import pg from "pg";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = readFileSync(resolve(root, ".env"), "utf8");
const m = env.match(/^DATABASE_URL=(.+)$/m);
const pool = new pg.Pool({
  connectionString: m[1].trim(),
  ssl: { rejectUnauthorized: false },
});

for (const id of process.argv.slice(2)) {
  const r = await pool.query(
    `SELECT status, ai_evaluation FROM interview_sessions WHERE id = $1`,
    [id],
  );
  const ev = r.rows[0]?.ai_evaluation;
  console.log(id, r.rows[0]?.status);
  console.log("  keys:", ev ? Object.keys(ev) : null);
  console.log("  dims:", ev?.profile_dimensions?.length ?? 0);
  console.log("  questions:", ev?.questions?.length ?? 0);
  console.log("  weighted:", ev?.weighted_score);
}
await pool.end();
