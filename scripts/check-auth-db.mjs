import pg from "pg";
import { readFileSync } from "node:fs";

const env = readFileSync(".env", "utf8");
const m = env.match(/DATABASE_URL=(.+)/);
const c = new pg.Client({
  connectionString: m[1].trim(),
  ssl: { rejectUnauthorized: false },
});
await c.connect();
const profiles = await c.query("SELECT user_id, email, display_name FROM profiles LIMIT 10");
const roles = await c.query("SELECT user_id, role FROM user_roles LIMIT 10");
const admins = await c.query("SELECT count(*)::int AS n FROM user_roles WHERE role='admin'");
console.log("profiles:", profiles.rows);
console.log("roles:", roles.rows);
console.log("admin count:", admins.rows[0].n);
await c.end();
