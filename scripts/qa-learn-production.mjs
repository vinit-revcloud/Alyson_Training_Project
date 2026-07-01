/**
 * Automated slice of docs/LEARN_ADMIN_QA_CHECKLIST.md (pre-flight + DB + HTTP).
 * Usage: node scripts/qa-learn-production.mjs
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
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20000) });
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { res, body };
}

async function runHttpChecks() {
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
      if (c.aiConfigured) pass("PF-AI", "AI keys configured on production");
      else fail("PF-AI", "No DEEPSEEK_API_KEY or OPENROUTER_API_KEY on production");
      if (c.s3Configured && c.s3Reachable === true) {
        pass("PF-S3", "S3 bucket reachable from production");
      } else if (c.s3Configured) {
        warn("PF-S3", "S3 configured but reachability check failed");
      } else {
        fail("PF-S3", "S3 not configured on production");
      }
      if (detail.storage === "s3" || c.s3Configured) {
        pass("PF-STORAGE", `Asset storage backend: ${detail.storage ?? "s3"}`);
      } else {
        warn("PF-STORAGE", `Storage backend: ${detail.storage ?? "unknown"}`);
      }
    } else {
      fail("PF-DETAIL", "Detailed health check failed (CRON_SECRET may not match Vercel)");
    }
  } else {
    skip("PF-DETAIL", "CRON_SECRET not in local .env");
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
    const roles = await pool.query(
      `SELECT role, count(DISTINCT user_id)::int AS n FROM user_roles GROUP BY role ORDER BY role`,
    );
    pass("ROLES-DATA", `Roles: ${roles.rows.map((r) => `${r.role}=${r.n}`).join(", ")}`);

    const trainers = roles.rows.find((r) => r.role === "trainer" || r.role === "admin");
    if (trainers) pass("PF-TRAINER", "At least one trainer/admin exists");
    else fail("PF-TRAINER", "No trainer or admin users for class creation");

    const trainees = await pool.query(
      `SELECT count(*)::int AS n FROM user_roles WHERE role = 'trainee'`,
    );
    if (trainees.rows[0]?.n > 0) pass("PF-TRAINEE", `${trainees.rows[0].n} trainee user(s)`);
    else warn("PF-TRAINEE", "No trainee users — manual learner tests need one");

    const deptTrainees = await pool.query(
      `SELECT count(*)::int AS n FROM profiles p
       JOIN user_roles ur ON ur.user_id = p.user_id AND ur.role = 'trainee'
       WHERE p.department IS NOT NULL AND trim(p.department) <> ''`,
    );
    if (deptTrainees.rows[0]?.n > 0) {
      pass("PF-DEPT", `${deptTrainees.rows[0].n} trainee(s) with department set`);
    } else {
      warn("PF-DEPT", "No trainees with profiles.department — department course visibility untested");
    }

    const emptyShells = await pool.query(
      `SELECT c.id, c.title, c.is_core_onboarding
       FROM courses c
       WHERE c.status = 'published'
         AND NOT EXISTS (
           SELECT 1 FROM sections s
           JOIN classes cl ON cl.id = s.class_id
           WHERE cl.course_id = c.id AND cl.status = 'published'
         )
       ORDER BY c.title`,
    );
    if (emptyShells.rows.length > 0) {
      warn(
        "A5-E5-SEED",
        `${emptyShells.rows.length} published course(s) with 0 published sections (should be hidden in nav): ${emptyShells.rows.map((r) => r.title).join("; ")}`,
      );
    } else {
      pass("A5-E5-SEED", "No empty published course shells");
    }

    const aiBuilder = await pool.query(
      `SELECT c.title, COUNT(s.id)::int AS sections
       FROM courses c
       LEFT JOIN classes cl ON cl.course_id = c.id AND cl.status = 'published'
       LEFT JOIN sections s ON s.class_id = cl.id
       WHERE c.title ILIKE '%ai builder%'
       GROUP BY c.id, c.title
       ORDER BY sections DESC`,
    );
    pass(
      "E2-DATA",
      `AI Builder courses: ${aiBuilder.rows.map((r) => `${r.title}=${r.sections} sections`).join("; ") || "none"}`,
    );

    const hasContentCourse = aiBuilder.rows.some((r) => r.sections > 0);
    const emptySeed = aiBuilder.rows.some(
      (r) => r.title.toLowerCase() === "how to be an ai builder" && r.sections === 0,
    );
    if (hasContentCourse) pass("E2-CONTENT", "At least one AI Builder course has published sections");
    else fail("E2-CONTENT", "No AI Builder course with published sections in DB");
    if (emptySeed) {
      warn("E2-SEED", "Seed 'How to be an AI Builder' still has 0 sections — nav must hide it");
    }

    const s3Assets = await pool.query(
      `SELECT count(*)::int AS n FROM section_assets
       WHERE storage_bucket IS NOT NULL AND storage_path IS NOT NULL`,
    );
    const linkOnly = await pool.query(
      `SELECT count(*)::int AS n FROM section_assets
       WHERE external_url IS NOT NULL AND storage_path IS NULL
         AND kind IN ('document', 'transcript')`,
    );
    pass("F-DATA", `${s3Assets.rows[0].n} S3-backed section_assets; ${linkOnly.rows[0].n} link-only docs/transcripts`);

    const brokenRefs = await pool.query(
      `SELECT count(*)::int AS n FROM section_assets sa
       JOIN sections s ON s.id = sa.section_id
       JOIN classes cl ON cl.id = s.class_id
       WHERE cl.status = 'published'
         AND sa.kind = 'document'
         AND sa.storage_path IS NULL
         AND sa.external_url IS NULL`,
    );
    if (brokenRefs.rows[0]?.n > 0) {
      fail("F-BROKEN", `${brokenRefs.rows[0].n} published document row(s) with no storage_path or external_url`);
    } else {
      pass("F-BROKEN", "No published documents missing both storage and external URL");
    }

    const cross = await pool.query(
      `SELECT count(*)::int AS n
       FROM assessment_assignments aa
       JOIN assessments a ON a.id = aa.assessment_id
       WHERE a.purpose = 'interview'`,
    );
    if (cross.rows[0]?.n === 0) {
      pass("I-CROSS", "Zero trainee assignments on interview-purpose assessments");
    } else {
      fail("I-CROSS", `${cross.rows[0].n} interview assessment(s) assigned to trainees`);
    }

    const pathUsers = await pool.query(
      `SELECT count(DISTINCT user_id)::int AS n FROM learner_path_assignments`,
    );
    const coreCourses = await pool.query(
      `SELECT count(*)::int AS n FROM courses WHERE is_core_onboarding AND status = 'published'`,
    );
    pass(
      "E3-DATA",
      `${pathUsers.rows[0].n} user(s) with path assignments; ${coreCourses.rows[0].n} published core course(s)`,
    );

    const visibleCourses = await pool.query(
      `SELECT c.title, c.is_core_onboarding, COUNT(s.id)::int AS sections
       FROM courses c
       JOIN classes cl ON cl.course_id = c.id AND cl.status = 'published'
       JOIN sections s ON s.class_id = cl.id
       WHERE c.status = 'published'
       GROUP BY c.id, c.title, c.is_core_onboarding
       HAVING COUNT(s.id) > 0
       ORDER BY c.is_core_onboarding DESC, c.title
       LIMIT 15`,
    );
    pass(
      "NAV-DATA",
      `Learner-visible courses (with sections): ${visibleCourses.rows.length} — e.g. ${visibleCourses.rows.slice(0, 3).map((r) => r.title).join(", ")}`,
    );

    const openAssignments = await pool.query(
      `SELECT count(*)::int AS n FROM assessment_assignments
       WHERE status IN ('assigned', 'in_progress')`,
    );
    pass("G-DATA", `${openAssignments.rows[0].n} open trainee assignment(s) for manual attempt test`);
  } finally {
    await pool.end();
  }
}

async function main() {
  console.log(`Learn/Admin QA — target: ${base}\n`);
  await runHttpChecks();
  await runDbChecks();

  console.log(`\nPASS: ${results.pass.length}`);
  for (const p of results.pass) console.log(`  ✓ [${p.id}] ${p.msg}`);

  if (results.warn.length) {
    console.log(`\nWARN: ${results.warn.length}`);
    for (const w of results.warn) console.log(`  ! [${w.id}] ${w.msg}`);
  }

  if (results.skip.length) {
    console.log(`\nSKIP: ${results.skip.length}`);
    for (const s of results.skip) console.log(`  - [${s.id}] ${s.msg}`);
  }

  if (results.fail.length) {
    console.log(`\nFAIL: ${results.fail.length}`);
    for (const f of results.fail) console.log(`  ✗ [${f.id}] ${f.msg}${f.detail ? ` — ${f.detail}` : ""}`);
    process.exitCode = 1;
  } else {
    console.log("\nAutomated checks: PASS (manual browser phases still required)");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
