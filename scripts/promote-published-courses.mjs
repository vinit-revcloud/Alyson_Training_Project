/**
 * One-time fix: set course status = published when it has at least one published class.
 * Run after deploying learner visibility fixes for existing data.
 *
 * Usage: node scripts/promote-published-courses.mjs
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import pg from "pg";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

try {
  const raw = readFileSync(resolve(root, ".env"), "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
} catch {
  /* no .env */
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const courses = await pool.query(
    `UPDATE courses c
     SET status = 'published', updated_at = now()
     WHERE c.status <> 'published'
       AND EXISTS (
         SELECT 1 FROM classes cl
         WHERE cl.course_id = c.id AND cl.status = 'published'
       )
     RETURNING c.id, c.title`,
  );
  console.log(`Promoted ${courses.rowCount} course(s) to published:`);
  for (const row of courses.rows) {
    console.log(`  - ${row.title} (${row.id})`);
  }
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
