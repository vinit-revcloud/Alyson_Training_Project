/**
 * Test full bootstrap + invite consume (rolls back at end unless --commit passed)
 */
import pg from "pg";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

try {
  const raw = readFileSync(".env", "utf8");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
} catch {
  /* */
}

const INVITE_EXPIRY_DAYS = 14;
function isInviteExpired(createdAt) {
  return Date.now() > new Date(createdAt).getTime() + INVITE_EXPIRY_DAYS * 86_400_000;
}

const userId = randomUUID();
const email = "test@cintara.ai";
const token = "013ee39428bc04ac411476958fcf44b6";
const commit = process.argv.includes("--commit");

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

try {
  await client.query("BEGIN");
  await client.query(
    `INSERT INTO profiles (user_id, email, display_name, status) VALUES ($1,$2,'Test User','active')
     ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email`,
    [userId, email],
  );

  const byToken = await client.query(`SELECT * FROM invites WHERE token = $1`, [token]);
  const row = byToken.rows[0];
  console.log("invite found:", !!row, "expired:", row ? isInviteExpired(row.created_at) : null);
  console.log("email match:", row?.email?.toLowerCase() === email);

  if (row && !row.accepted_at && row.email.toLowerCase() === email && !isInviteExpired(row.created_at)) {
    await client.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, $2)`, [userId, row.role]);
    await client.query(
      `UPDATE invites SET accepted_at = now(), accepted_by = $1 WHERE id = $2`,
      [userId, row.id],
    );
    console.log("role assigned:", row.role);
  } else {
    console.log("consume failed");
  }

  const roles = await client.query(`SELECT role FROM user_roles WHERE user_id = $1`, [userId]);
  console.log("roles:", roles.rows);

  if (commit) {
    await client.query("COMMIT");
    console.log("COMMITTED userId:", userId);
  } else {
    await client.query("ROLLBACK");
    console.log("rolled back (dry run)");
  }
} catch (e) {
  await client.query("ROLLBACK");
  console.error("ERROR:", e.message);
}

await client.end();
