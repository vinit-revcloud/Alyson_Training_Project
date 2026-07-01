/**
 * One-time data fixes for learn/admin QA issues:
 * - Remove learner_path_assignments to published courses with zero sections
 * - Unpublish duplicate published classes under the same course (keep newest with most assets)
 *
 * Usage: node scripts/fix-learn-qa-data.mjs [--dry-run]
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dryRun = process.argv.includes("--dry-run");

function loadEnv() {
  const env = { ...process.env };
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
      if (!env[key]) env[key] = value;
    }
  } catch {
    /* no .env */
  }
  return env;
}

const pool = new pg.Pool({
  connectionString: loadEnv().DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  console.log(dryRun ? "DRY RUN — no writes\n" : "Applying learn QA data fixes…\n");

  const badPaths = await pool.query(`
    SELECT lpa.id, lpa.user_id, p.email, c.title, lpa.course_id
    FROM learner_path_assignments lpa
    JOIN profiles p ON p.user_id = lpa.user_id
    JOIN courses c ON c.id = lpa.course_id
    WHERE NOT EXISTS (
      SELECT 1 FROM sections s
      JOIN classes cl ON cl.id = s.class_id
      WHERE cl.course_id = lpa.course_id AND cl.status = 'published'
    )
  `);

  console.log(`Path assignments to empty courses: ${badPaths.rowCount}`);
  for (const row of badPaths.rows) {
    console.log(`  - ${row.email}: ${row.title} (${row.course_id})`);
  }

  if (!dryRun && badPaths.rowCount > 0) {
    await pool.query(`
      DELETE FROM learner_path_assignments lpa
      WHERE NOT EXISTS (
        SELECT 1 FROM sections s
        JOIN classes cl ON cl.id = s.class_id
        WHERE cl.course_id = lpa.course_id AND cl.status = 'published'
      )
    `);
    console.log(`Deleted ${badPaths.rowCount} stale path assignment(s).\n`);
  }

  const dupes = await pool.query(`
    SELECT cl.course_id, c.title AS course_title, cl.id, cl.name, cl.created_at,
           COUNT(DISTINCT s.id)::int AS sections,
           COUNT(DISTINCT sa.id) FILTER (WHERE sa.storage_path IS NOT NULL)::int AS stored_assets,
           COUNT(DISTINCT sa.id) FILTER (
             WHERE sa.storage_path IS NOT NULL AND sa.storage_path LIKE cl.id || '/%'
           )::int AS owned_assets
    FROM classes cl
    JOIN courses c ON c.id = cl.course_id
    LEFT JOIN sections s ON s.class_id = cl.id
    LEFT JOIN section_assets sa ON sa.section_id = s.id
    WHERE cl.status = 'published'
    GROUP BY cl.course_id, c.title, cl.id, cl.name, cl.created_at
    HAVING COUNT(DISTINCT s.id) > 0
    ORDER BY cl.course_id, cl.created_at
  `);

  const byCourse = new Map();
  for (const row of dupes.rows) {
    const list = byCourse.get(row.course_id) ?? [];
    list.push(row);
    byCourse.set(row.course_id, list);
  }

  const toDraft = [];
  for (const [, classes] of byCourse) {
    if (classes.length < 2) continue;
    const sorted = [...classes].sort((a, b) => {
      if (b.owned_assets !== a.owned_assets) return b.owned_assets - a.owned_assets;
      if (b.stored_assets !== a.stored_assets) return b.stored_assets - a.stored_assets;
      if (b.sections !== a.sections) return b.sections - a.sections;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    const keep = sorted[0];
    for (const drop of sorted.slice(1)) {
      if (drop.name === keep.name || drop.sections === keep.sections) {
        toDraft.push({ ...drop, keepId: keep.id });
      }
    }
  }

  console.log(`Duplicate published classes to demote: ${toDraft.length}`);
  for (const row of toDraft) {
    console.log(
      `  - draft ${row.name} (${row.id}) — keeping ${row.keepId} under ${row.course_title}`,
    );
  }

  if (!dryRun && toDraft.length > 0) {
    for (const row of toDraft) {
      await pool.query(`UPDATE classes SET status = 'draft', updated_at = now() WHERE id = $1`, [
        row.id,
      ]);
    }
    console.log(`Set ${toDraft.length} duplicate class(es) to draft.\n`);
  }

  const emptyPublished = await pool.query(`
    SELECT c.id, c.title FROM courses c
    WHERE c.status = 'published'
      AND NOT EXISTS (
        SELECT 1 FROM sections s
        JOIN classes cl ON cl.id = s.class_id
        WHERE cl.course_id = c.id AND cl.status = 'published'
      )
    ORDER BY c.title
  `);
  console.log(
    `Published course shells with 0 sections (hidden in nav by code): ${emptyPublished.rowCount}`,
  );
  for (const row of emptyPublished.rows) {
    console.log(`  - ${row.title}`);
  }

  await pool.end();
  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
