/**
 * Grant admin+trainer roles to a user by email (one-time bootstrap).
 * Usage: node scripts/grant-admin.mjs admin@cintara.ai
 */
import pg from "pg";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = readFileSync(resolve(root, ".env"), "utf8");
const m = env.match(/^DATABASE_URL=(.+)$/m);
if (!m) throw new Error("Missing DATABASE_URL");

const email = (process.argv[2] ?? "").trim().toLowerCase();
if (!email) {
  console.error("Usage: node scripts/grant-admin.mjs <email>");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: m[1].trim(),
  ssl: { rejectUnauthorized: false },
});

const client = await pool.connect();
try {
  await client.query("BEGIN");

  const profile = await client.query(
    `SELECT user_id, email FROM profiles WHERE lower(email)=lower($1) LIMIT 1`,
    [email],
  );

  if (!profile.rows[0]) {
    console.error(`No profile found for ${email}. Sign in once first so Neon Auth creates the account.`);
    process.exit(1);
  }

  const userId = profile.rows[0].user_id;

  for (const role of ["admin", "trainer"]) {
    await client.query(
      `INSERT INTO user_roles (user_id, role) VALUES ($1, $2) ON CONFLICT (user_id, role) DO NOTHING`,
      [userId, role],
    );
  }

  await client.query(
    `UPDATE invites
     SET accepted_at = COALESCE(accepted_at, now()),
         accepted_by = COALESCE(accepted_by, $1),
         updated_at = now()
     WHERE lower(email) = lower($2) AND accepted_at IS NULL`,
    [userId, email],
  );

  const roles = await client.query(`SELECT role FROM user_roles WHERE user_id = $1`, [userId]);
  await client.query("COMMIT");

  console.log(`Granted roles to ${email} (${userId}):`, roles.rows.map((r) => r.role).join(", "));
} catch (err) {
  await client.query("ROLLBACK");
  throw err;
} finally {
  client.release();
  await pool.end();
}
