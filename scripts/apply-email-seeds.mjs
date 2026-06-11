/**
 * Idempotent email template + schedule seeds (weekly CEO, test_completed).
 * Usage: npm run db:apply-email-seeds
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnv() {
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
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    /* optional */
  }
}

loadEnv();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
await client.connect();

await client.query(`
  INSERT INTO public.email_templates (key, audience, subject, body_md) VALUES
  ('weekly_ceo_summary','admin','Weekly training summary — {current_score}',
   E'Hi {learner_name},\\n\\n**Weekly training snapshot**\\n\\n- **Progress:** {current_score}\\n- **Pending assignments:** see dashboard\\n- **Open analytics:** {retake_link}\\n\\n— Alyson Training')
  ON CONFLICT (key) DO NOTHING
`);

await client.query(`
  INSERT INTO public.notification_schedules (job_key, label, enabled, cron_expression, config) VALUES
    ('test_completed', 'Test submitted notice', true, 'on_event', '{}'::jsonb),
    ('weekly_ceo_summary', 'Weekly CEO progress summary', false, '0 9 * * 1', '{}'::jsonb)
  ON CONFLICT (job_key) DO NOTHING
`);

await client.query(`
  UPDATE notification_schedules
  SET config = COALESCE(config, '{}'::jsonb) || '{"only_when_due_within_days": 1}'::jsonb
  WHERE job_key = 'reminder_daily' AND NOT (config ? 'only_when_due_within_days')
`);

console.log("Email seeds applied.");
await client.end();
