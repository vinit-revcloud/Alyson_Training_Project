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

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const tpl = await client.query(`SELECT key FROM email_templates WHERE key = 'invite_new'`);
console.log("invite_new template:", tpl.rows.length ? "found" : "MISSING");

const q = await client.query(
  `SELECT count(*)::int AS n FROM email_queue
   WHERE queue_name = 'transactional_emails' AND archived_at IS NULL`,
);
console.log("pending transactional queue:", q.rows[0].n);

const logs = await client.query(
  `SELECT status, recipient_email, error, created_at
   FROM notification_log WHERE template_key = 'invite_new'
   ORDER BY created_at DESC LIMIT 5`,
);
console.log("recent invite notification_log:");
for (const row of logs.rows) {
  console.log(`  ${row.created_at} | ${row.status} | ${row.recipient_email} | ${row.error ?? ""}`);
}

const sendLog = await client.query(
  `SELECT status, recipient_email, error_message, created_at
   FROM email_send_log WHERE template_name = 'invite_new'
   ORDER BY created_at DESC LIMIT 5`,
);
console.log("recent invite email_send_log:");
for (const row of sendLog.rows) {
  console.log(`  ${row.created_at} | ${row.status} | ${row.recipient_email} | ${row.error_message ?? ""}`);
}

await client.end();
