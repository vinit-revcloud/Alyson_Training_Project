import pg from "pg";
import { readFileSync } from "node:fs";

const url = readFileSync(".env", "utf8").match(/DATABASE_URL=(.+)/m)[1].trim();
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();

const rls = await c.query(`
  SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname IN ('courses', 'course_departments', 'classes')
`);
console.log("RLS flags:", rls.rows);

const policies = await c.query(`
  SELECT tablename, policyname, cmd, roles, qual, with_check
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'course_departments'
`);
console.log("\nPolicies on course_departments:", policies.rows);

const owner = await c.query(`
  SELECT t.tablename, pg_get_userbyid(c.relowner) AS owner
  FROM pg_tables t
  JOIN pg_class c ON c.relname = t.tablename
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = t.schemaname
  WHERE t.schemaname = 'public' AND t.tablename = 'course_departments'
`);
console.log("\nOwner:", owner.rows);

const anonGrants = await c.query(`
  SELECT grantee, privilege_type
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND table_name = 'course_departments'
    AND grantee IN ('anonymous', 'authenticator')
`);
console.log("\nAnonymous/authenticator grants:", anonGrants.rows);

await c.end();
