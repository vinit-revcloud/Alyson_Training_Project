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

const id = process.argv[2] ?? "d71d9253-fbef-4e1f-a9ae-22e7cef5eb03";
const { ensureInterviewProfileReport } = await import("../src/lib/interview/profile-evaluate.server.ts");
const { parseAiEvaluation } = await import("../src/lib/interview/interview.shared.ts");
const { normalizeSessionRow } = await import("../src/lib/interview/interview-parse.server.ts");

const r = await pool.query(`SELECT s.*, a.title AS assessment_title FROM interview_sessions s JOIN assessments a ON a.id = s.assessment_id WHERE s.id = $1`, [id]);
const row = r.rows[0];
console.log("status", row.status);
console.log("raw dims", row.ai_evaluation?.profile_dimensions?.length);
const parsed = parseAiEvaluation(row.ai_evaluation);
console.log("parsed dims", parsed?.profile_dimensions?.length);
const normalized = normalizeSessionRow(row);
console.log("normalized dims", normalized.ai_evaluation?.profile_dimensions?.length);

const t0 = Date.now();
const ensured = await ensureInterviewProfileReport(id);
console.log("ensure took ms", Date.now() - t0, "dims", ensured?.profile_dimensions?.length);

await pool.end();
