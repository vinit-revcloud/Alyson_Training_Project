import pg from "pg";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = readFileSync(resolve(root, ".env"), "utf8");
const pool = new pg.Pool({
  connectionString: env.match(/^DATABASE_URL=(.+)$/m)[1].trim(),
  ssl: { rejectUnauthorized: false },
});

const id = "d71d9253-fbef-4e1f-a9ae-22e7cef5eb03";
const { rows } = await pool.query(
  `SELECT s.*, a.title AS assessment_title,
          (SELECT count(*)::text FROM assessment_questions q WHERE q.assessment_id = s.assessment_id) AS question_count
   FROM interview_sessions s
   JOIN assessments a ON a.id = s.assessment_id
   WHERE s.id = $1`,
  [id],
);
const row = rows[0];
console.log("ai_evaluation type:", typeof row.ai_evaluation);
console.log("is string?", typeof row.ai_evaluation === "string");
if (typeof row.ai_evaluation === "string") {
  console.log("first 100 chars:", row.ai_evaluation.slice(0, 100));
}
await pool.end();
