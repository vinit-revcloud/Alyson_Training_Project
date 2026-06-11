/**
 * Invoke the unified cron tick (scheduled jobs + queue drain).
 * Usage: npm run email:cron
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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

const base = (process.env.APP_BASE_URL ?? "http://localhost:5173").replace(/\/$/, "");
const secret = process.env.CRON_SECRET;
if (!secret) {
  console.error("CRON_SECRET is required");
  process.exit(1);
}

const res = await fetch(`${base}/api/internal/cron/tick`, {
  method: "POST",
  headers: { Authorization: `Bearer ${secret}` },
});

const text = await res.text();
console.log(res.status, text);
process.exit(res.ok ? 0 : 1);
