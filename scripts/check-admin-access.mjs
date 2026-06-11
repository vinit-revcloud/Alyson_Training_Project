import pg from "pg";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = readFileSync(resolve(root, ".env"), "utf8");
const m = env.match(/^DATABASE_URL=(.+)$/m);
if (!m) throw new Error("Missing DATABASE_URL");

const pool = new pg.Pool({
  connectionString: m[1].trim(),
  ssl: { rejectUnauthorized: false },
});

const email = process.argv[2] ?? "admin@cintara.ai";

try {
  const profiles = await pool.query(
    `SELECT user_id, email, display_name, status FROM profiles WHERE lower(email)=lower($1)`,
    [email],
  );
  const invites = await pool.query(
    `SELECT id, email, role, accepted_at, created_at FROM invites WHERE lower(email)=lower($1)`,
    [email],
  );
  const allRoles = await pool.query(
    `SELECT ur.user_id, ur.role, p.email FROM user_roles ur LEFT JOIN profiles p ON p.user_id=ur.user_id`,
  );
  const adminCount = await pool.query(
    `SELECT count(*)::int AS n FROM user_roles WHERE role='admin'`,
  );

  console.log("email:", email);
  console.log("profiles:", profiles.rows);
  console.log("invites:", invites.rows);
  console.log("all user_roles:", allRoles.rows);
  console.log("admin count:", adminCount.rows[0]?.n);
} finally {
  await pool.end();
}
