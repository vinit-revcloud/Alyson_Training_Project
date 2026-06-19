/**
 * Apply all database migrations in documented order.
 * Usage: npm run db:apply-all
 * Requires DATABASE_URL in .env or environment.
 */

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const steps = [
  "db:apply",
  "db:apply-interview",
  "db:apply-enterprise",
  "db:apply-paper-only",
  "db:apply-rls",
  "db:apply-email-seeds",
  "db:apply-email-queue-fix",
  "db:apply-scale-indexes",
];

console.log("Applying all database scripts in order…\n");

for (const script of steps) {
  console.log(`→ npm run ${script}`);
  const result = spawnSync("npm", ["run", script], {
    cwd: root,
    stdio: "inherit",
    shell: true,
  });
  if (result.status !== 0) {
    console.error(`\n✗ Failed at ${script}`);
    process.exit(result.status ?? 1);
  }
  console.log("");
}

console.log("✓ All database scripts applied successfully");
