import pg from "pg";
import { readFileSync } from "node:fs";

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

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const cols = await client.query(
  `SELECT column_name FROM information_schema.columns WHERE table_name = 'invites' ORDER BY 1`,
);
console.log("invites columns:", cols.rows.map((r) => r.column_name).join(", "));

const allProfiles = await client.query(
  `SELECT p.email, array_agg(ur.role::text) as roles
   FROM profiles p LEFT JOIN user_roles ur ON ur.user_id = p.user_id
   GROUP BY p.email ORDER BY p.email LIMIT 20`,
);
console.log("all profiles:", JSON.stringify(allProfiles.rows, null, 2));

// Simulate bootstrap consume
const userId = "00000000-0000-4000-8000-000000000099";
const email = "test@cintara.ai";
const token = "013ee39428bc04ac411476958fcf44b6";

try {
  await client.query("BEGIN");
  await client.query(
    `INSERT INTO profiles (user_id, email, display_name, status) VALUES ($1,$2,'Test','active')
     ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email`,
    [userId, email],
  );
  const inv = await client.query(`SELECT * FROM invites WHERE token = $1`, [token]);
  console.log("invite row keys:", inv.rows[0] ? Object.keys(inv.rows[0]) : "none");
  await client.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'trainee')`, [userId]);
  await client.query("ROLLBACK");
  console.log("simulate: OK (rolled back)");
} catch (e) {
  await client.query("ROLLBACK");
  console.error("simulate FAILED:", e.message);
}

await client.end();
