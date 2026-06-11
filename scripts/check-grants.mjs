import pg from "pg";
import { readFileSync } from "node:fs";

const url = readFileSync(".env", "utf8").match(/DATABASE_URL=(.+)/m)[1].trim();
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();

const tables = ["courses", "classes", "course_departments", "sections", "section_assets"];
for (const table of tables) {
  const grants = await c.query(
    `SELECT grantee, privilege_type
     FROM information_schema.role_table_grants
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY grantee, privilege_type`,
    [table],
  );
  console.log(`\n=== ${table} grants ===`);
  console.log(grants.rows.length ? grants.rows : "(none)");
}

const roles = await c.query(
  `SELECT rolname FROM pg_roles WHERE rolname IN ('authenticated', 'anonymous', 'authenticator', 'neon_superuser')`,
);
console.log("\nRoles:", roles.rows);

await c.end();
