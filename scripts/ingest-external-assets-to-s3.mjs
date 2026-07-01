/**
 * Ingest external document/transcript URLs into S3 (or configured storage backend).
 *
 * Usage:
 *   node scripts/ingest-external-assets-to-s3.mjs --dry-run
 *   node scripts/ingest-external-assets-to-s3.mjs --section-id=<uuid>
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import pg from "pg";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

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
    /* no .env */
  }
}

loadEnv();

const dryRun = process.argv.includes("--dry-run");
const sectionArg = process.argv.find((a) => a.startsWith("--section-id="));
const sectionFilter = sectionArg?.split("=")[1]?.trim() || null;

const bucket = process.env.S3_ASSETS_BUCKET?.trim();
const region = process.env.S3_ASSETS_REGION?.trim() || process.env.AWS_REGION || "us-west-2";
const keyPrefix = process.env.S3_ASSETS_PREFIX?.trim().replace(/^\//, "").replace(/\/$/, "");
const FETCH_TIMEOUT_MS = 30_000;
const MAX_BYTES = 10 * 1024 * 1024;

if (!bucket) {
  console.error("S3_ASSETS_BUCKET is required");
  process.exit(1);
}

if (!process.env.DATABASE_URL?.trim()) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const s3 = new S3Client({
  region,
  credentials:
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        }
      : undefined,
});

function s3ObjectKey(logicalBucket, storagePath) {
  const prefix = keyPrefix ? `${keyPrefix}/` : "";
  return `${prefix}${logicalBucket}/${storagePath}`;
}

function bucketForKind(kind) {
  return kind === "document" ? "class-documents" : "class-transcripts";
}

function fileNameFromUrl(url, fallback) {
  try {
    const segment = new URL(url).pathname.split("/").filter(Boolean).pop();
    return segment && segment.length > 0 ? decodeURIComponent(segment) : fallback;
  } catch {
    return fallback;
  }
}

function safeFileName(name) {
  return name.replace(/[^a-zA-Z0-9_.-]/g, "_");
}

async function fetchBytes(url) {
  const trimmed = url.trim();
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(trimmed, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "AlysonTrainingAssetIngest/1.0" },
    });
    if (!res.ok) return null;
    const length = Number(res.headers.get("content-length") ?? 0);
    if (length > MAX_BYTES) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_BYTES) return null;
    return buf;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function uploadToS3(logicalBucket, storagePath, data) {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: s3ObjectKey(logicalBucket, storagePath),
      Body: data,
    }),
  );
}

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const params = [];
  let where = `sa.kind IN ('document', 'transcript')
     AND sa.external_url IS NOT NULL
     AND sa.storage_path IS NULL`;

  if (sectionFilter) {
    params.push(sectionFilter);
    where += ` AND sa.section_id = $${params.length}`;
  }

  const { rows } = await pool.query(
    `SELECT sa.id, sa.section_id, sa.kind, sa.external_url, sa.file_name,
            s.class_id, c.name AS class_name
     FROM section_assets sa
     JOIN sections s ON s.id = sa.section_id
     JOIN classes c ON c.id = s.class_id
     WHERE ${where}
     ORDER BY c.name, sa.created_at`,
    params,
  );

  console.log(`Found ${rows.length} external asset(s) to ingest${dryRun ? " (dry run)" : ""}.`);

  let ok = 0;
  let failed = 0;

  for (const row of rows) {
    const logicalBucket = bucketForKind(row.kind);
    const fallback = row.kind === "transcript" ? "transcript.txt" : "document.pdf";
    const fileName = row.file_name?.trim() || fileNameFromUrl(row.external_url, fallback);
    const storagePath = `${row.class_id}/${row.section_id}/${Date.now()}-${safeFileName(fileName)}`;

    console.log(`\n• ${row.class_name} / ${row.kind}: ${row.external_url.slice(0, 100)}`);

    if (dryRun) {
      console.log(`  would upload to s3://${bucket}/${s3ObjectKey(logicalBucket, storagePath)}`);
      ok++;
      continue;
    }

    const data = await fetchBytes(row.external_url);
    if (!data?.length) {
      console.warn("  SKIP — could not fetch URL (auth, redirect, or size limit)");
      failed++;
      continue;
    }

    try {
      await uploadToS3(logicalBucket, storagePath, data);
      await pool.query(
        `UPDATE section_assets
         SET storage_bucket = $2,
             storage_path = $3,
             external_url = NULL,
             file_name = $4,
             size_bytes = $5
         WHERE id = $1`,
        [row.id, logicalBucket, storagePath, fileName, data.length],
      );
      console.log(`  OK — s3://${bucket}/${s3ObjectKey(logicalBucket, storagePath)}`);
      ok++;
    } catch (err) {
      console.warn(`  FAIL — ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  }

  await pool.end();
  console.log(`\nDone: ${ok} succeeded, ${failed} failed.`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
