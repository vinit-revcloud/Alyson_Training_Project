import pg from "pg";
import { readFileSync } from "node:fs";

const url = readFileSync(".env", "utf8").match(/DATABASE_URL=(.+)/m)[1].trim();
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
const r = await c.query(`
  SELECT c.relname
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = true
  ORDER BY c.relname
`);
console.log(r.rows.map((x) => x.relname).join("\n"));
await c.end();
