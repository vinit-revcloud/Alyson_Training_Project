/**
 * Apply db/neon-schema.sql to Neon (no psql required).
 * Usage: node scripts/apply-neon-schema.mjs
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnv() {
  const envPath = resolve(root, ".env");
  try {
    const raw = readFileSync(envPath, "utf8");
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
    /* .env optional if DATABASE_URL already set */
  }
}

loadEnv();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set in .env or environment.");
  process.exit(1);
}

const schemaPath = resolve(root, "db", "neon-schema.sql");
const sql = readFileSync(schemaPath, "utf8");

const client = new pg.Client({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  console.log("Connected to Neon. Applying schema...");
  await client.query(sql);
  const { rows } = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  console.log(`Schema applied. ${rows.length} public tables:`);
  for (const row of rows) console.log(`  - ${row.table_name}`);
} catch (err) {
  console.error("Schema apply failed:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
