import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(resolve(root, ".env"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i < 0) continue;
  const k = t.slice(0, i).trim();
  let v = t.slice(i + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  if (!process.env[k]) process.env[k] = v;
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const { rows } = await client.query(`
  SELECT i.email, i.accepted_at, i.created_at,
         p.user_id IS NOT NULL AS has_profile,
         EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = p.user_id) AS has_roles
  FROM invites i
  LEFT JOIN profiles p ON lower(p.email) = lower(i.email)
  ORDER BY i.created_at DESC
`);

console.log("Invite rows vs actual accounts:");
for (const r of rows) {
  const uiStatus = r.accepted_at ? "Accepted" : "Pending/Expired";
  const stale = !r.accepted_at && r.has_roles;
  console.log(
    `${r.email} | db accepted_at: ${r.accepted_at ? "yes" : "no"} | has_roles: ${r.has_roles} | UI would show: ${uiStatus}${stale ? " ** STALE (user joined but invite not marked accepted) **" : ""}`,
  );
}

await client.end();
