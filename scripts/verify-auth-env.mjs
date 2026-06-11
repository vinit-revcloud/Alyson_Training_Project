/**
 * Quick check that Neon Auth env vars are present.
 * Usage: node scripts/verify-auth-env.mjs
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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
    /* optional */
  }
}

loadEnv();

const required = [
  "VITE_NEON_AUTH_URL",
  "VITE_NEON_DATA_API_URL",
  "DATABASE_URL",
  "CRON_SECRET",
];

let ok = true;
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing ${key}`);
    ok = false;
  } else {
    console.log(`OK ${key}`);
  }
}

const appBase = process.env.APP_BASE_URL ?? "http://localhost:5173";
console.log(`APP_BASE_URL (or default): ${appBase}`);
console.log(
  "\nNeon Console checklist:",
  "\n  - Auth enabled on branch",
  "\n  - Data API enabled",
  "\n  - Trusted domain: http://localhost:5173",
  "\n  - Allow localhost: on",
  "\n  - Google OAuth enabled",
  "\n  - Email/password enabled",
  "\n  - Google redirect URI: <VITE_NEON_AUTH_URL>/callback/google",
);

process.exit(ok ? 0 : 1);
