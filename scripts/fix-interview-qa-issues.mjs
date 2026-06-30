/**
 * One-time / repeatable fixes for interview QA failures (see docs/INTERVIEW_QA_RESULTS.md).
 *
 * 1. Grant hiring_manager to users with trainer role (and any pending hiring_manager invites)
 * 2. Rename duplicate interview assessment titles (keeps session-linked copy when possible)
 * 3. Optionally drain email queue via cron tick
 *
 * Usage:
 *   node scripts/fix-interview-qa-issues.mjs
 *   node scripts/fix-interview-qa-issues.mjs --skip-email
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const skipEmail = process.argv.includes("--skip-email");

function loadEnv() {
  const env = { ...process.env };
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
  return env;
}

const env = loadEnv();
const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function grantHiringManagers(client) {
  const trainers = await client.query(
    `SELECT ur.user_id, p.email
     FROM user_roles ur
     JOIN profiles p ON p.user_id = ur.user_id
     WHERE ur.role = 'trainer'`,
  );
  let granted = 0;
  for (const row of trainers.rows) {
    const res = await client.query(
      `INSERT INTO user_roles (user_id, role) VALUES ($1, 'hiring_manager')
       ON CONFLICT (user_id, role) DO NOTHING
       RETURNING user_id`,
      [row.user_id],
    );
    if (res.rowCount) {
      granted += 1;
      console.log(`  + hiring_manager → ${row.email}`);
    }
  }

  const invitees = await client.query(
    `SELECT DISTINCT lower(email) AS email FROM invites
     WHERE role = 'hiring_manager' AND accepted_at IS NULL`,
  );
  for (const inv of invitees.rows) {
    const prof = await client.query(
      `SELECT user_id FROM profiles WHERE lower(email) = $1 LIMIT 1`,
      [inv.email],
    );
    if (!prof.rows[0]) continue;
    const res = await client.query(
      `INSERT INTO user_roles (user_id, role) VALUES ($1, 'hiring_manager')
       ON CONFLICT (user_id, role) DO NOTHING
       RETURNING user_id`,
      [prof.rows[0].user_id],
    );
    if (res.rowCount) {
      granted += 1;
      console.log(`  + hiring_manager (from invite) → ${inv.email}`);
    }
  }

  const hmCount = await client.query(
    `SELECT count(DISTINCT user_id)::int AS n FROM user_roles WHERE role = 'hiring_manager'`,
  );
  console.log(`Hiring managers in DB: ${hmCount.rows[0]?.n ?? 0} (new grants: ${granted})`);
}

async function uniqueTitle(client, baseTitle, excludeId) {
  let candidate = baseTitle;
  let n = 2;
  while (true) {
    const { rows } = await client.query(
      `SELECT id FROM assessments
       WHERE purpose = 'interview' AND lower(trim(title)) = lower(trim($1))
         AND ($2::uuid IS NULL OR id <> $2)
       LIMIT 1`,
      [candidate, excludeId ?? null],
    );
    if (!rows[0]) return candidate;
    candidate = `${baseTitle} (${n})`;
    n += 1;
  }
}

async function dedupeInterviewTitles(client) {
  const dupes = await client.query(
    `SELECT title FROM assessments
     WHERE purpose = 'interview'
     GROUP BY title HAVING count(*) > 1`,
  );
  if (!dupes.rows.length) {
    console.log("No duplicate interview titles.");
    return;
  }

  for (const { title } of dupes.rows) {
    const group = await client.query(
      `SELECT a.id, a.title, a.updated_at,
              (SELECT count(*)::int FROM interview_sessions s WHERE s.assessment_id = a.id) AS sessions
       FROM assessments a
       WHERE a.purpose = 'interview' AND a.title = $1
       ORDER BY sessions DESC, a.updated_at DESC`,
      [title],
    );
    const [keep, ...rest] = group.rows;
    console.log(`Duplicate "${title}": keeping ${keep.id} (${keep.sessions} sessions)`);
    for (const row of rest) {
      const newTitle = await uniqueTitle(client, title, row.id);
      await client.query(`UPDATE assessments SET title = $2, updated_at = now() WHERE id = $1`, [
        row.id,
        newTitle,
      ]);
      console.log(`  renamed ${row.id} → "${newTitle}"`);
    }
  }
}

async function drainEmailQueue() {
  const base = (env.APP_BASE_URL || "").replace(/\/$/, "");
  const secret = env.CRON_SECRET;
  if (!base || !secret) {
    console.log("Skip email drain — missing APP_BASE_URL or CRON_SECRET");
    return;
  }
  const res = await fetch(`${base}/api/internal/cron/tick`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(60000),
  });
  const body = await res.text();
  console.log(`Cron tick: HTTP ${res.status}`, body.slice(0, 200));
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    console.log("\n=== Grant hiring_manager roles ===");
    await grantHiringManagers(client);
    console.log("\n=== Deduplicate interview test titles ===");
    await dedupeInterviewTitles(client);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }

  if (!skipEmail) {
    console.log("\n=== Drain email queue (cron tick) ===");
    await drainEmailQueue();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
