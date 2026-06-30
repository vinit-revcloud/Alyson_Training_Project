/**
 * Automated slice of docs/INTERVIEW_QA_CHECKLIST.md (pre-flight + data + HTTP).
 * Usage: node scripts/qa-interview-production.mjs
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

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

const env = loadEnv();
const base = (env.APP_BASE_URL || "https://alyson-training-project-fvf6.vercel.app").replace(
  /\/$/,
  "",
);
const cronSecret = env.CRON_SECRET || "";

const results = { pass: [], fail: [], skip: [], warn: [] };

function pass(id, msg) {
  results.pass.push({ id, msg });
}
function fail(id, msg, detail = "") {
  results.fail.push({ id, msg, detail });
}
function skip(id, msg) {
  results.skip.push({ id, msg });
}
function warn(id, msg) {
  results.warn.push({ id, msg });
}

async function fetchJson(url, init = {}) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { res, body };
}

async function runHttpChecks() {
  // Pre-flight: APP_BASE_URL HTTPS
  if (/^https:\/\//i.test(base) && !/localhost|127\.0\.0\.1/i.test(base)) {
    pass("PF-01", `APP_BASE_URL is HTTPS production: ${base}`);
  } else {
    fail("PF-01", "APP_BASE_URL must be HTTPS production URL", base);
  }

  const { res: healthRes, body: health } = await fetchJson(`${base}/api/health`);
  if (healthRes.ok && health?.ok === true) {
    pass("PF-HTTP", "Production /api/health returns ok");
  } else {
    fail("PF-HTTP", "Production /api/health failed", JSON.stringify(health));
  }

  if (cronSecret) {
    const { res: detailRes, body: detail } = await fetchJson(`${base}/api/health`, {
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
    if (detailRes.ok && detail?.checks) {
      const c = detail.checks;
      if (c.database) pass("PF-DB-REMOTE", "Production database reachable");
      else fail("PF-DB-REMOTE", "Production database unreachable via health check");
      if (c.neonAuthJwks) pass("PF-AUTH", "Neon Auth JWKS reachable from production");
      else fail("PF-AUTH", "Neon Auth JWKS unreachable from production");
      if (c.aiConfigured) pass("PF-AI", "AI keys configured on production");
      else fail("PF-AI", "No DEEPSEEK_API_KEY or OPENROUTER_API_KEY on production");
      if (c.sesConfigured) pass("PF-SES", "SES region configured on production");
      else warn("PF-SES", "SES not reported configured on production health");
      if (c.s3Configured && c.s3Reachable === true) pass("PF-S3", "S3 bucket reachable from production");
      else if (c.s3Configured) warn("PF-S3", "S3 configured but reachability check failed or skipped");
    } else {
      fail("PF-DETAIL", "Detailed health check failed (CRON_SECRET may not match Vercel env)");
    }

    const { res: cronRes, body: cronBody } = await fetchJson(`${base}/api/internal/cron/tick`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
    if (cronRes.ok) {
      pass("PF-CRON", "Cron tick endpoint accepts CRON_SECRET and returns 200");
    } else {
      fail(
        "PF-CRON",
        `Cron tick failed (${cronRes.status})`,
        typeof cronBody === "object" ? JSON.stringify(cronBody) : String(cronBody),
      );
    }
  } else {
    skip("PF-CRON", "CRON_SECRET not in local .env — cannot test cron remotely");
  }

  // Invalid interview token (C6) — SPA may return 200 shell; check is informational only
  try {
    const badTokenRes = await fetch(
      `${base}/interview/00000000-0000-0000-0000-000000000000`,
      { signal: AbortSignal.timeout(15000), redirect: "manual" },
    );
    if (badTokenRes.status === 404 || badTokenRes.status >= 400) {
      pass("C6-TOKEN", "Invalid interview token URL returns error status");
    } else {
      warn(
        "C6-TOKEN",
        `Invalid interview token returned HTTP ${badTokenRes.status} (SPA shell — verify manually in browser)`,
      );
    }
  } catch (e) {
    fail("C6-TOKEN", "Could not fetch invalid interview token URL", String(e));
  }
}

async function runDbChecks() {
  const url = env.DATABASE_URL;
  if (!url) {
    skip("DB-ALL", "DATABASE_URL not set locally");
    return;
  }

  const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
  try {
    const hm = await pool.query(
      `SELECT count(DISTINCT user_id)::int AS n FROM user_roles WHERE role = 'hiring_manager'`,
    );
    if (hm.rows[0]?.n > 0) pass("PF-HM", `${hm.rows[0].n} hiring_manager user(s) in DB`);
    else fail("PF-HM", "No hiring_manager users — HR cannot use interview flow");

    const interviewTests = await pool.query(
      `SELECT id, title, status, purpose FROM assessments WHERE purpose = 'interview' ORDER BY title`,
    );
    const published = interviewTests.rows.filter((r) =>
      ["validated", "published"].includes(r.status),
    );
    if (published.length > 0) {
      pass("A1-DATA", `${published.length} schedulable interview test(s) (validated/published)`);
    } else {
      fail("A1-DATA", "No validated/published interview tests in DB");
    }

    const titles = interviewTests.rows.map((r) => r.title);
    const dupes = titles.filter((t, i) => titles.indexOf(t) !== i);
    if (dupes.length === 0) {
      pass("A5-DATA", "No duplicate interview assessment titles in DB");
    } else {
      fail("A5-DATA", "Duplicate interview test titles block bulk import", [...new Set(dupes)].join(", "));
    }

    const draftInterview = interviewTests.rows.filter((r) => r.status === "draft");
    if (draftInterview.length > 0) {
      warn("A4-DATA", `${draftInterview.length} interview test(s) still in draft — not schedulable`);
    }

    const sessions = await pool.query(
      `SELECT status, count(*)::int AS n FROM interview_sessions GROUP BY status ORDER BY status`,
    );
    pass("B-DATA", `Interview sessions by status: ${sessions.rows.map((r) => `${r.status}=${r.n}`).join(", ") || "none"}`);

    const snapshotMissing = await pool.query(
      `SELECT count(*)::int AS n FROM interview_sessions
       WHERE assessment_version_id IS NULL AND status NOT IN ('cancelled', 'expired')`,
    );
    if (snapshotMissing.rows[0]?.n === 0) {
      pass("B2-DATA", "All active sessions have assessment_version_id snapshot");
    } else {
      warn(
        "B2-DATA",
        `${snapshotMissing.rows[0]?.n} active session(s) missing assessment_version_id (legacy rows?)`,
      );
    }

    const emailTpl = await pool.query(
      `SELECT 1 FROM email_templates WHERE key = 'interview_invite' LIMIT 1`,
    );
    if (emailTpl.rows.length) pass("G-DATA", "interview_invite email template exists");
    else fail("G-DATA", "Missing interview_invite email template");

    const pendingEmail = await pool.query(
      `SELECT count(*)::int AS n FROM email_queue WHERE archived_at IS NULL`,
    );
    if (pendingEmail.rows[0]?.n > 50) {
      warn("G-QUEUE", `${pendingEmail.rows[0].n} pending emails in queue — cron may be behind`);
    } else {
      pass("G-QUEUE", `Email queue pending: ${pendingEmail.rows[0]?.n ?? 0}`);
    }

    const interviewAssigned = await pool.query(
      `SELECT count(*)::int AS n
       FROM assessment_assignments aa
       JOIN assessments a ON a.id = aa.assessment_id
       WHERE a.purpose = 'interview'`,
    );
    if (interviewAssigned.rows[0]?.n === 0) {
      pass("F-DATA", "No interview tests assigned to trainees (cross-contamination)");
    } else {
      fail(
        "F-DATA",
        `${interviewAssigned.rows[0]?.n} trainee assignment(s) linked to interview tests`,
      );
    }

    const roles = await pool.query(
      `SELECT role, count(*)::int AS n FROM user_roles GROUP BY role ORDER BY role`,
    );
    results._roles = roles.rows;

    const dupeRows = await pool.query(
      `SELECT title, count(*)::int AS n FROM assessments
       WHERE purpose = 'interview' GROUP BY title HAVING count(*) > 1`,
    );
    results._duplicateTitles = dupeRows.rows;

    const noSnap = await pool.query(
      `SELECT id, status, candidate_name, created_at::text
       FROM interview_sessions
       WHERE assessment_version_id IS NULL AND status NOT IN ('cancelled', 'expired')
       ORDER BY created_at DESC LIMIT 10`,
    );
    results._sessionsWithoutSnapshot = noSnap.rows;
  } finally {
    await pool.end();
  }
}

function checkAiKeysLocal() {
  if (env.DEEPSEEK_API_KEY || env.OPENROUTER_API_KEY) {
    pass("PF-AI-LOCAL", "AI key present in local .env (mirrors Vercel if synced)");
  } else {
    warn("PF-AI-LOCAL", "No AI key in local .env — verify Vercel env separately");
  }
}

async function main() {
  checkAiKeysLocal();
  await runHttpChecks();
  await runDbChecks();

  console.log(JSON.stringify({ base, results }, null, 2));
  process.exit(results.fail.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
