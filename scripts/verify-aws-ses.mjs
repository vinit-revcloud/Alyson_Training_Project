/**
 * Verify AWS SES credentials and sender configuration.
 * Usage: npm run email:verify-aws
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SESv2Client, GetAccountCommand, ListEmailIdentitiesCommand } from "@aws-sdk/client-sesv2";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnv() {
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
}

loadEnv();

const region = process.env.AWS_REGION ?? "us-east-1";
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const cronSecret = process.env.CRON_SECRET;
const autoProcess = process.env.EMAIL_AUTO_PROCESS;

const missing = [];
if (!accessKeyId) missing.push("AWS_ACCESS_KEY_ID");
if (!secretAccessKey) missing.push("AWS_SECRET_ACCESS_KEY");
if (!cronSecret) missing.push("CRON_SECRET");

if (missing.length) {
  console.error("Missing env:", missing.join(", "));
  process.exit(1);
}

console.log("Config:");
console.log("  AWS_REGION:", region);
console.log("  SES_FROM: training.group@cintara.ai");
console.log("  SES_CONFIGURATION_SET:", process.env.SES_CONFIGURATION_SET ?? "(none)");
console.log("  CRON_SECRET: set");
console.log("  EMAIL_AUTO_PROCESS:", autoProcess ?? "(off)");
console.log("  APP_BASE_URL:", process.env.APP_BASE_URL ?? "(default)");

const client = new SESv2Client({
  region,
  credentials: { accessKeyId, secretAccessKey },
});

try {
  const account = await client.send(new GetAccountCommand({}));
  console.log("\nSES account OK");
  console.log("  Production access:", account.ProductionAccessEnabled ? "yes" : "no (sandbox)");
  if (!account.ProductionAccessEnabled) {
    console.log("  Note: in sandbox, recipients must be verified in SES.");
  }
} catch {
  try {
    const ids = await client.send(new ListEmailIdentitiesCommand({ PageSize: 5 }));
    console.log("\nListEmailIdentities OK — credentials valid");
    console.log("  Identities:", (ids.EmailIdentities ?? []).map((i) => i.IdentityName).join(", ") || "(none)");
  } catch {
    console.log("\nEnv credentials present. IAM lacks GetAccount/ListEmailIdentities (common).");
    console.log("  Sending still works if the user has ses:SendEmail on training.group@cintara.ai.");
    console.log("  Test delivery: npm run email:process (after queuing via Email Testing).");
  }
}
