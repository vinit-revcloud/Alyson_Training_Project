/**
 * Pre-deploy environment and build readiness checks.
 * Usage: npm run validate:deploy
 * Optional: NODE_ENV=production npm run validate:deploy -- --production
 */

import { readFileSync, existsSync } from "node:fs";
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

function env(key) {
  return process.env[key]?.trim() ?? "";
}

function hasNeonAuthUrl() {
  return Boolean(env("VITE_NEON_AUTH_URL") || env("NEON_AUTH_URL"));
}

function hasNeonDataApiUrl() {
  return Boolean(env("VITE_NEON_DATA_API_URL") || env("NEON_DATA_API_URL"));
}

loadEnv();

const isProdCheck = process.env.NODE_ENV === "production" || process.argv.includes("--production");
const isVercelCheck = Boolean(process.env.VERCEL) || process.argv.includes("--vercel");

const warnings = [];
const errors = [];

if (!hasNeonAuthUrl()) {
  errors.push("Missing required env: VITE_NEON_AUTH_URL (or NEON_AUTH_URL for server runtime)");
}
if (!hasNeonDataApiUrl()) {
  errors.push("Missing required env: VITE_NEON_DATA_API_URL (or NEON_DATA_API_URL for server runtime)");
}

for (const key of [
  "DATABASE_URL",
  "CRON_SECRET",
  "APP_BASE_URL",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
]) {
  if (!env(key)) {
    errors.push(`Missing required env: ${key}`);
  }
}

const appBaseUrl = env("APP_BASE_URL");
if (appBaseUrl && /localhost|127\.0\.0\.1/i.test(appBaseUrl) && isProdCheck) {
  errors.push("APP_BASE_URL must be your production HTTPS URL (not localhost)");
}
if (isProdCheck && !appBaseUrl && !process.env.VERCEL_URL && !isVercelCheck) {
  errors.push("APP_BASE_URL is required in production (or deploy on Vercel with VERCEL_URL)");
}

if (process.env.EMAIL_AUTO_PROCESS === "1" && isProdCheck) {
  errors.push("EMAIL_AUTO_PROCESS must be unset or 0 in production");
}

if (!env("DEEPSEEK_API_KEY") && !env("OPENROUTER_API_KEY")) {
  errors.push("Set DEEPSEEK_API_KEY and/or OPENROUTER_API_KEY");
}

const awsRegion = env("AWS_REGION") || "us-west-2";
const sesRegion = env("SES_REGION") || awsRegion;
if (env("AWS_REGION") && env("SES_REGION") && env("AWS_REGION") !== env("SES_REGION")) {
  warnings.push("AWS_REGION and SES_REGION differ — SES sends use SES_REGION");
}
if (env("S3_ASSETS_REGION") && env("AWS_REGION") && env("S3_ASSETS_REGION") !== env("AWS_REGION")) {
  warnings.push(
    `S3_ASSETS_REGION (${env("S3_ASSETS_REGION")}) differs from AWS_REGION (${env("AWS_REGION")}) — S3 client uses S3_ASSETS_REGION`,
  );
}
const lambdaArn = env("EMAIL_WORKFLOW_LAMBDA_ARN");
if (lambdaArn && lambdaArn.includes("ACCOUNT_ID")) {
  warnings.push("EMAIL_WORKFLOW_LAMBDA_ARN still contains ACCOUNT_ID placeholder");
}
if (lambdaArn && !lambdaArn.includes(":us-west-2:") && lambdaArn.startsWith("arn:aws:lambda:")) {
  warnings.push(
    `EMAIL_WORKFLOW_LAMBDA_ARN is not in us-west-2 — expected Oregon to match this project's defaults`,
  );
}
if (isProdCheck && sesRegion !== "us-west-2" && !env("SES_REGION")) {
  warnings.push(
    `SES effective region is ${sesRegion} — verify training.group@cintara.ai is verified in that region`,
  );
}

if (isProdCheck && env("BOOTSTRAP_ADMIN_EMAILS").includes("admin@cintara.ai")) {
  warnings.push("BOOTSTRAP_ADMIN_EMAILS still lists admin@cintara.ai — remove after initial bootstrap");
}

if (!env("SES_CONFIGURATION_SET")) {
  warnings.push("SES_CONFIGURATION_SET is unset — SES event tracking may be limited");
}

if (!env("EMAIL_WORKFLOW_LAMBDA_ARN")) {
  warnings.push(
    "EMAIL_WORKFLOW_LAMBDA_ARN is unset — assignment email Step Functions workflow will not run",
  );
}

if (isProdCheck && isVercelCheck && !env("S3_ASSETS_BUCKET") && !env("BLOB_READ_WRITE_TOKEN")) {
  warnings.push(
    "S3_ASSETS_BUCKET is unset — set it for production asset storage (or BLOB_READ_WRITE_TOKEN as legacy fallback)",
  );
}

if (isProdCheck && !env("S3_ASSETS_BUCKET")) {
  const blobBackend =
    env("BLOB_READ_WRITE_TOKEN") &&
    (env("ASSET_STORAGE_BACKEND") === "vercel-blob" || env("ASSET_STORAGE_BACKEND") === "blob");
  if (!blobBackend) {
    errors.push("Missing required env: S3_ASSETS_BUCKET (class PDFs and media)");
  }
}

if (isProdCheck && !isVercelCheck && !env("NEON_AUTH_URL") && env("VITE_NEON_AUTH_URL")) {
  warnings.push(
    "Set NEON_AUTH_URL at runtime for Docker/self-hosted (VITE_* is build-time only)",
  );
}
if (isProdCheck && !isVercelCheck && !env("NEON_DATA_API_URL") && env("VITE_NEON_DATA_API_URL")) {
  warnings.push(
    "Set NEON_DATA_API_URL at runtime for Docker/self-hosted (VITE_* is build-time only)",
  );
}

const hasNodeBuild = existsSync(resolve(root, ".output/server/index.mjs"));
const hasVercelBuild = existsSync(resolve(root, ".vercel/output"));
if (!hasNodeBuild && !hasVercelBuild) {
  warnings.push("No production build found — run npm run build before deploy");
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
