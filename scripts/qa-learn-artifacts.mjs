/** One-off artifact dump for QA results — not part of CI */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
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

const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const out = {};

const classRow = await pool.query(`
  SELECT cl.id AS class_id, cl.name AS class_name, cl.status,
         c.id AS course_id, c.title AS course_title,
         COUNT(s.id)::int AS sections
  FROM classes cl
  JOIN courses c ON c.id = cl.course_id
  LEFT JOIN sections s ON s.class_id = cl.id
  WHERE c.title ILIKE '%AI Builder Foundations%' AND cl.status = 'published'
  GROUP BY cl.id, cl.name, cl.status, c.id, c.title
`);
out.aiBuilderClass = classRow.rows[0];

const section = await pool.query(`
  SELECT s.id AS section_id, s.title AS section_title,
         sa.file_name, sa.storage_bucket, sa.storage_path
  FROM sections s
  JOIN classes cl ON cl.id = s.class_id
  JOIN courses c ON c.id = cl.course_id
  LEFT JOIN section_assets sa ON sa.section_id = s.id AND sa.kind = 'document'
  WHERE c.title ILIKE '%AI Builder Foundations%'
    AND cl.status = 'published'
    AND sa.storage_path IS NOT NULL
  LIMIT 1
`);
out.primarySection = section.rows[0];

const trainee = await pool.query(`
  SELECT p.email, p.department, p.user_id
  FROM profiles p
  JOIN user_roles ur ON ur.user_id = p.user_id AND ur.role = 'trainee'
  LIMIT 1
`);
out.trainee = trainee.rows[0];

const assign = await pool.query(`
  SELECT aa.id AS assignment_id, a.id AS assessment_id, a.title, a.purpose, aa.status
  FROM assessment_assignments aa
  JOIN assessments a ON a.id = aa.assessment_id
  WHERE a.purpose = 'training'
  ORDER BY aa.created_at DESC
  LIMIT 1
`);
out.openAssignment = assign.rows[0];

const pathUser = await pool.query(`
  SELECT p.email, COUNT(lpa.course_id)::int AS path_courses
  FROM learner_path_assignments lpa
  JOIN profiles p ON p.user_id = lpa.user_id
  GROUP BY p.email
  LIMIT 1
`);
out.pathAssignmentUser = pathUser.rows[0];

const bulkClass = await pool.query(`
  SELECT cl.id, cl.name, c.title AS course_title, COUNT(s.id)::int AS sections
  FROM classes cl
  JOIN courses c ON c.id = cl.course_id
  JOIN sections s ON s.class_id = cl.id
  WHERE cl.status = 'published'
  GROUP BY cl.id, cl.name, c.title
  HAVING COUNT(s.id) >= 2
  ORDER BY cl.created_at DESC
  LIMIT 3
`);
out.publishedClassesWithSections = bulkClass.rows;

const aiBuilderDupes = await pool.query(`
  SELECT cl.id, cl.name, cl.status, cl.created_at,
         COUNT(s.id)::int AS sections,
         COUNT(sa.id) FILTER (WHERE sa.storage_path IS NOT NULL)::int AS stored_assets
  FROM classes cl
  JOIN courses c ON c.id = cl.course_id
  LEFT JOIN sections s ON s.class_id = cl.id
  LEFT JOIN section_assets sa ON sa.section_id = s.id
  WHERE c.title ILIKE '%AI Builder Foundations%'
  GROUP BY cl.id ORDER BY stored_assets DESC, cl.created_at DESC
`);
out.aiBuilderDupes = aiBuilderDupes.rows;

await pool.end();
console.log(JSON.stringify(out, null, 2));
