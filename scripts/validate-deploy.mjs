/**
 * Pre-deploy environment and build readiness checks.
 * Usage: npm run validate:deploy
 * Optional: NODE_ENV=production npm run validate:deploy  (strict production rules)
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

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
    /* no .env — rely on host env */
  }
}

loadEnv();

const isProdCheck = process.env.NODE_ENV === "production" || process.argv.includes("--production");

const required = [
  "VITE_NEON_AUTH_URL",
  "VITE_NEON_DATA_API_URL",
  "DATABASE_URL",
  "CRON_SECRET",
  "APP_BASE_URL",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
];

const warnings = [];
const errors = [];

for (const key of required) {
  if (!process.env[key]?.trim()) {
    errors.push(`Missing required env: ${key}`);
  }
}

const appBaseUrl = process.env.APP_BASE_URL?.trim() ?? "";
if (appBaseUrl && /localhost|127\.0\.0\.1/i.test(appBaseUrl) && isProdCheck) {
  errors.push("APP_BASE_URL must be your production HTTPS URL (not localhost)");
}

if (process.env.EMAIL_AUTO_PROCESS === "1" && isProdCheck) {
  errors.push("EMAIL_AUTO_PROCESS must be unset or 0 in production");
}

if (!process.env.DEEPSEEK_API_KEY?.trim() && !process.env.OPENROUTER_API_KEY?.trim()) {
  errors.push("Set DEEPSEEK_API_KEY and/or OPENROUTER_API_KEY");
}

if (isProdCheck && process.env.BOOTSTRAP_ADMIN_EMAILS?.includes("admin@cintara.ai")) {
  warnings.push("BOOTSTRAP_ADMIN_EMAILS still lists admin@cintara.ai — remove after initial bootstrap");
}

if (!process.env.SES_CONFIGURATION_SET?.trim()) {
  warnings.push("SES_CONFIGURATION_SET is unset — SES event tracking may be limited");
}

if (errors.length) {
  console.error("Deploy validation failed:\n");
  for (const e of errors) console.error(`  ✗ ${e}`);
  if (warnings.length) {
    console.error("\nWarnings:");
    for (const w of warnings) console.warn(`  ⚠ ${w}`);
  }
  process.exit(1);
}

console.log("✓ Deploy validation passed");
if (warnings.length) {
  console.log("\nWarnings:");
  for (const w of warnings) console.warn(`  ⚠ ${w}`);
}

if (!isProdCheck) {
  console.log("\nTip: run with --production or NODE_ENV=production for strict production checks.");
}
