/**
 * Audit live DB schema vs app expectations.
 * Usage: node scripts/audit-schema.mjs
 */
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

const REQUIRED_TABLES = [
  "profiles",
  "user_roles",
  "invites",
  "courses",
  "course_departments",
  "classes",
  "sections",
  "section_assets",
  "section_questions",
  "assessments",
  "assessment_questions",
  "assessment_assignments",
  "assessment_attempts",
  "attempt_answers",
  "candidates",
  "email_templates",
  "notification_log",
  "notification_schedules",
  "email_send_log",
  "email_send_state",
  "email_queue",
  "suppressed_emails",
  "interview_sessions",
];

const REQUIRED_FUNCTIONS = [
  "enqueue_email",
  "read_email_batch",
  "delete_email",
  "move_to_dlq",
  "expire_assignment",
  "record_attempt_result",
  "auto_assign_course",
  "has_role",
];

const REQUIRED_TEMPLATES = [
  "invite_new",
  "assignment_new",
  "reminder_daily",
  "failure_retake",
  "test_completed",
  "escalation_day7",
  "escalation_day14",
  "escalation_day30",
  "interview_invite",
  "interview_submitted",
  "interview_evaluated",
];

const REQUIRED_JOBS = [
  "reminder_daily",
  "escalation",
  "weekly_ceo_summary",
  "assignment_new",
  "failure_retake",
  "test_completed",
];

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const issues = [];
const ok = [];

function fail(msg) {
  issues.push(msg);
}
function pass(msg) {
  ok.push(msg);
}

await client.connect();

try {
  const tables = await client.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
  );
  const tableSet = new Set(tables.rows.map((r) => r.tablename));
  for (const t of REQUIRED_TABLES) {
    if (tableSet.has(t)) pass(`table ${t}`);
    else fail(`MISSING table: ${t}`);
  }

  const fns = await client.query(
    `SELECT p.proname AS name
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'`,
  );
  const fnSet = new Set(fns.rows.map((r) => r.name));
  for (const f of REQUIRED_FUNCTIONS) {
    if (fnSet.has(f)) pass(`function ${f}`);
    else fail(`MISSING function: ${f}`);
  }

  const tpls = await client.query(`SELECT key FROM email_templates`);
  const tplSet = new Set(tpls.rows.map((r) => r.key));
  for (const k of REQUIRED_TEMPLATES) {
    if (tplSet.has(k)) pass(`template ${k}`);
    else fail(`MISSING email template: ${k}`);
  }

  const jobs = await client.query(`SELECT job_key, enabled FROM notification_schedules`);
  const jobSet = new Set(jobs.rows.map((r) => r.job_key));
  for (const j of REQUIRED_JOBS) {
    if (jobSet.has(j)) pass(`schedule ${j}`);
    else fail(`MISSING notification schedule: ${j}`);
  }

  const state = await client.query(`SELECT id FROM email_send_state WHERE id = 1`);
  if (state.rows.length) pass("email_send_state row");
  else fail("MISSING email_send_state id=1");

  // FK chain sanity: classes without course, assessments without class
  const orphanClasses = await client.query(
    `SELECT count(*)::int AS n FROM classes WHERE course_id IS NULL`,
  );
  if (orphanClasses.rows[0].n > 0) {
    fail(`${orphanClasses.rows[0].n} class(es) with NULL course_id (allowed by schema but breaks course tree)`);
  } else {
    pass("no orphan classes (null course_id)");
  }

  const orphanAssessments = await client.query(
    `SELECT count(*)::int AS n FROM assessments a
     LEFT JOIN classes c ON c.id = a.class_id WHERE c.id IS NULL`,
  );
  if (orphanAssessments.rows[0].n > 0) {
    fail(`${orphanAssessments.rows[0].n} assessment(s) with missing class`);
  } else {
    pass("all assessments linked to classes");
  }

  const assignmentsNoAssessment = await client.query(
    `SELECT count(*)::int AS n FROM assessment_assignments aa
     LEFT JOIN assessments a ON a.id = aa.assessment_id WHERE a.id IS NULL`,
  );
  if (assignmentsNoAssessment.rows[0].n > 0) {
    fail(`${assignmentsNoAssessment.rows[0].n} assignment(s) with missing assessment`);
  } else {
    pass("all assignments linked to assessments");
  }

  // section_assets kinds
  const badAssets = await client.query(
    `SELECT count(*)::int AS n FROM section_assets
     WHERE kind NOT IN ('video','document','transcript','video_link')`,
  );
  if (badAssets.rows[0].n > 0) fail(`${badAssets.rows[0].n} section_assets with invalid kind`);
  else pass("section_assets kinds valid");

  // Queue smoke test
  const testPayload = { test: true, at: new Date().toISOString() };
  const enq = await client.query(`SELECT enqueue_email($1, $2::jsonb) AS id`, [
    "_audit_test",
    JSON.stringify(testPayload),
  ]);
  const msgId = enq.rows[0]?.id;
  if (msgId) {
    const batch = await client.query(`SELECT msg_id FROM read_email_batch($1, 1, 1)`, ["_audit_test"]);
    if (batch.rows.length) {
      await client.query(`SELECT delete_email($1, $2)`, ["_audit_test", batch.rows[0].msg_id]);
      pass("email queue enqueue/read/delete");
    } else fail("email queue read returned empty after enqueue");
  } else fail("email queue enqueue failed");

  // Graph counts
  const counts = await client.query(`
    SELECT
      (SELECT count(*)::int FROM courses) AS courses,
      (SELECT count(*)::int FROM classes) AS classes,
      (SELECT count(*)::int FROM sections) AS sections,
      (SELECT count(*)::int FROM assessments) AS assessments,
      (SELECT count(*)::int FROM assessment_assignments) AS assignments,
      (SELECT count(*)::int FROM invites) AS invites,
      (SELECT count(*)::int FROM profiles) AS profiles
  `);
  console.log("\nRow counts:", counts.rows[0]);

  console.log("\n=== PASS (" + ok.length + ") ===");
  for (const m of ok) console.log("  ✓", m);

  if (issues.length) {
    console.log("\n=== ISSUES (" + issues.length + ") ===");
    for (const m of issues) console.log("  ✗", m);
    process.exit(1);
  }
  console.log("\n✓ Schema audit passed");
} finally {
  await client.end();
}
