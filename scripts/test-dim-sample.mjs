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
const r = await pool.query(`SELECT ai_evaluation->'profile_dimensions' AS dims FROM interview_sessions WHERE id = $1`, [id]);
console.log(JSON.stringify(r.rows[0].dims?.[0], null, 2));
await pool.end();
