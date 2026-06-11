/**
 * Dry-run invite email pipeline (enqueue + process). Pass recipient as argv[2].
 * Usage: node scripts/test-invite-send.mjs person@cintara.ai
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

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

const to = process.argv[2];
if (!to) {
  console.error("Usage: node scripts/test-invite-send.mjs <recipient@cintara.ai>");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const tplRes = await client.query(
  `SELECT subject, body_md FROM email_templates WHERE key = 'invite_new'`,
);
const tpl = tplRes.rows[0];
if (!tpl) {
  console.error("invite_new template missing");
  process.exit(1);
}

const signupLink = `${process.env.APP_BASE_URL ?? "http://localhost:5173"}/auth?email=${encodeURIComponent(to)}&mode=signup&token=test-token`;
const subject = tpl.subject.replace(/\{[^}]+\}/g, "Alyson Training");
const html = `<p>Test invite for <a href="${signupLink}">${signupLink}</a></p>`;
const idem = `invite_new:test:${to}:${new Date().toISOString().slice(0, 10)}`;
const messageId = crypto.randomUUID();

await client.query(
  `INSERT INTO notification_log (template_key, audience, recipient_email, subject, status, idempotency_key)
   VALUES ('invite_new', 'learner', $1, $2, 'pending', $3)
   ON CONFLICT (idempotency_key) DO NOTHING`,
  [to, subject, idem],
);

const enq = await client.query(`SELECT enqueue_email($1, $2::jsonb) AS id`, [
  "transactional_emails",
  JSON.stringify({
    to,
    subject,
    html,
    label: "invite_new",
    message_id: messageId,
    idempotency_key: idem,
    queued_at: new Date().toISOString(),
  }),
]);
console.log("Enqueued message id:", enq.rows[0]?.id);

const batch = await client.query(
  `SELECT msg_id, message FROM read_email_batch('transactional_emails', 1, 30)`,
);
if (!batch.rows.length) {
  console.error("No message read from queue");
  process.exit(1);
}

const payload = batch.rows[0].message;
const ses = new SESv2Client({
  region: process.env.AWS_REGION ?? "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

async function sendWithOptionalConfigSet(baseParams) {
  const configSet = process.env.SES_CONFIGURATION_SET;
  if (!configSet) return ses.send(new SendEmailCommand(baseParams));
  try {
    return await ses.send(
      new SendEmailCommand({ ...baseParams, ConfigurationSetName: configSet }),
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Configuration set") && msg.includes("does not exist")) {
      console.warn(`Configuration set "${configSet}" not found — retrying without it.`);
      return ses.send(new SendEmailCommand(baseParams));
    }
    throw err;
  }
}

try {
  const result = await sendWithOptionalConfigSet({
    FromEmailAddress: `Cintara Training <training.group@cintara.ai>`,
    Destination: { ToAddresses: [payload.to] },
    Content: {
      Simple: {
        Subject: { Data: payload.subject, Charset: "UTF-8" },
        Body: { Html: { Data: payload.html, Charset: "UTF-8" } },
      },
    },
  });
  console.log("SES send OK:", result.MessageId);
  await client.query(`SELECT delete_email('transactional_emails', $1)`, [batch.rows[0].msg_id]);
  await client.query(
    `UPDATE notification_log SET status = 'sent', sent_at = now() WHERE idempotency_key = $1`,
    [idem],
  );
} catch (err) {
  console.error("SES send FAILED:", err.message ?? err);
  process.exit(1);
} finally {
  await client.end();
}
