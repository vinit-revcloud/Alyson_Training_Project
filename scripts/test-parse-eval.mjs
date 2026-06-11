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
const r = await pool.query(`SELECT ai_evaluation FROM interview_sessions WHERE id = $1`, [id]);
const ev = r.rows[0].ai_evaluation;

function num(v) {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parseAiEvaluation(raw) {
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      return parseAiEvaluation(JSON.parse(raw));
    } catch {
      return null;
    }
  }
  if (typeof raw !== "object") return null;
  const o = raw;
  const weighted = num(o.weighted_score);
  if (weighted == null || !Array.isArray(o.questions)) {
    console.log("PARSE FAIL:", { weighted, hasQuestions: Array.isArray(o.questions), weightedType: typeof o.weighted_score });
    return null;
  }
  return {
    weighted_score: weighted,
    questions: o.questions.length,
    profile_dims: o.profile_dimensions?.length,
    dim_keys: o.profile_dimensions?.map((d) => d.key),
  };
}

console.log("parse result:", parseAiEvaluation(ev));
console.log("weighted_score type:", typeof ev.weighted_score, ev.weighted_score);

await pool.end();
