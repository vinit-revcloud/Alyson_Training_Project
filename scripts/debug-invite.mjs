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

const token = process.argv[2] ?? "013ee39428bc04ac411476958fcf44b6";
const email = process.argv[3] ?? "test@cintara.ai";

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const inv = await client.query(
  `SELECT id, email, role, accepted_at, created_at, token, department
   FROM invites WHERE token = $1 OR lower(email) = lower($2)
   ORDER BY created_at DESC`,
  [token, email],
);
console.log("invites:", JSON.stringify(inv.rows, null, 2));

const prof = await client.query(
  `SELECT p.user_id, p.email, p.display_name, p.status,
          COALESCE(array_agg(ur.role::text) FILTER (WHERE ur.role IS NOT NULL), '{}') AS roles
   FROM profiles p
   LEFT JOIN user_roles ur ON ur.user_id = p.user_id
   WHERE lower(p.email) = lower($1)
   GROUP BY p.user_id, p.email, p.display_name, p.status`,
  [email],
);
console.log("profile:", JSON.stringify(prof.rows, null, 2));

await client.end();
