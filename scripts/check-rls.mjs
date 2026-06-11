import pg from "pg";
import { readFileSync } from "node:fs";

const url = readFileSync(".env", "utf8").match(/DATABASE_URL=(.+)/m)[1].trim();
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
const r = await c.query(`
  SELECT p.proname,
         pg_get_function_identity_arguments(p.oid) AS args,
         pg_catalog.format_type(p.prorettype, null) AS ret
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'auth' AND p.proname IN ('user_id', 'uid')
`);
console.log(r.rows);
await c.end();
