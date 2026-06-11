/**
 * Smoke-test profile/role bootstrap via direct Postgres.
 * Usage: node scripts/test-bootstrap.mjs
 */
import { readFileSync } from "node:fs";

// Dynamic import of compiled logic isn't available; inline minimal test
import pg from "pg";

const env = readFileSync(".env", "utf8");
const m = env.match(/DATABASE_URL=(.+)/);
const pool = new pg.Pool({
  connectionString: m[1].trim(),
  ssl: { rejectUnauthorized: false },
});

const testUserId = "00000000-0000-4000-8000-000000000099";
const testEmail = "admin@cintara.ai";

const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query(
    `INSERT INTO profiles (user_id, email, display_name) VALUES ($1,$2,$3)
     ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email`,
    [testUserId, testEmail, "Admin"],
  );
  const existing = await client.query(`SELECT role FROM user_roles WHERE user_id = $1`, [testUserId]);
  if (existing.rows.length === 0) {
    console.log("Bootstrap: invite-only policy — no roles granted without a pending invite");
  }
  await client.query("ROLLBACK");
  console.log("Bootstrap SQL OK (rolled back test transaction)");
} finally {
  client.release();
  await pool.end();
}
