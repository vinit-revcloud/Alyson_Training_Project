/**

 * One-time migration: copy assets from local disk, Vercel Blob, or S3 to the configured S3 bucket.

 * DB paths are unchanged — only object storage backend moves.

 *

 * Usage:

 *   node scripts/migrate-assets-to-s3.mjs --from=local-disk

 *   node scripts/migrate-assets-to-s3.mjs --from=vercel-blob --dry-run

 *   node scripts/migrate-assets-to-s3.mjs --from=auto

 */



import { readFileSync } from "node:fs";

import { readFile } from "node:fs/promises";

import { resolve, dirname } from "node:path";

import { fileURLToPath } from "node:url";

import process from "node:process";

import pg from "pg";

import { PutObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";



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

const fromArg = process.argv.find((a) => a.startsWith("--from="));

const sourceBackend = fromArg?.split("=")[1] ?? "auto";



const bucket = process.env.S3_ASSETS_BUCKET?.trim();

const region = process.env.S3_ASSETS_REGION?.trim() || process.env.AWS_REGION || "us-west-2";

const keyPrefix = process.env.S3_ASSETS_PREFIX?.trim().replace(/^\//, "").replace(/\/$/, "");

const blobToken = process.env.BLOB_READ_WRITE_TOKEN?.trim();



if (!bucket) {

  console.error("S3_ASSETS_BUCKET is required");

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



const BUCKETS = new Set(["class-videos", "class-documents", "class-transcripts", "interview-papers"]);



function s3Key(logicalBucket, storagePath) {

  const prefix = keyPrefix ? `${keyPrefix}/` : "";

  return `${prefix}${logicalBucket}/${storagePath}`;

}



function blobPath(logicalBucket, storagePath) {

  return `${logicalBucket}/${storagePath}`;

}



async function readLocal(logicalBucket, storagePath) {

  const bucketRoot = resolve(root, "storage", logicalBucket);

  const full = resolve(bucketRoot, storagePath);

  if (!full.startsWith(`${bucketRoot}${process.platform === "win32" ? "\\" : "/"}`)) return null;

  try {

    return await readFile(full);

  } catch {

    return null;

  }

}



async function readBlob(logicalBucket, storagePath) {

  if (!blobToken) return null;

  const { head } = await import("@vercel/blob");

  const meta = await head(blobPath(logicalBucket, storagePath), { token: blobToken }).catch(() => null);

  if (!meta?.url) return null;

  const res = await fetch(meta.url);

  if (!res.ok) return null;

  return Buffer.from(await res.arrayBuffer());

}



async function readFromSourceBackend(backend, logicalBucket, storagePath) {

  if (backend === "vercel-blob") return readBlob(logicalBucket, storagePath);

  if (backend === "s3") return null;

  return readLocal(logicalBucket, storagePath);

}



async function readSource(logicalBucket, storagePath) {

  if (sourceBackend === "auto") {

    for (const backend of ["local-disk", "vercel-blob"]) {

      const data = await readFromSourceBackend(backend, logicalBucket, storagePath);

      if (data?.length) return { data, foundOn: backend };

    }

    return { data: null, foundOn: null };

  }

  const data = await readFromSourceBackend(sourceBackend, logicalBucket, storagePath);

  return { data, foundOn: data?.length ? sourceBackend : null };

}



async function existsOnS3(logicalBucket, storagePath) {

  try {

    await s3.send(

      new HeadObjectCommand({ Bucket: bucket, Key: s3Key(logicalBucket, storagePath) }),

    );

    return true;

  } catch {

    return false;

  }

}



async function uploadToS3(logicalBucket, storagePath, data) {

  await s3.send(

    new PutObjectCommand({

      Bucket: bucket,

      Key: s3Key(logicalBucket, storagePath),

      Body: data,

    }),

  );

}



const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });



async function main() {

  console.log(`Migrating to s3://${bucket} (${region}) from=${sourceBackend} dryRun=${dryRun}\n`);



  const { rows } = await pool.query(

    `SELECT DISTINCT storage_bucket, storage_path

     FROM section_assets

     WHERE storage_bucket IS NOT NULL AND storage_path IS NOT NULL

     UNION

     SELECT storage_bucket, storage_path

     FROM policy_documents

     WHERE storage_bucket IS NOT NULL AND storage_path IS NOT NULL`,

  );



  const interviewRows = await pool.query(

    `SELECT paper_assessment FROM interview_sessions WHERE paper_assessment IS NOT NULL`,

  );

  const tasks = rows.filter((r) => BUCKETS.has(r.storage_bucket));

  for (const row of interviewRows.rows) {

    const uploads = row.paper_assessment?.uploads;

    if (!Array.isArray(uploads)) continue;

    for (const u of uploads) {

      if (u?.storage_path) {

        tasks.push({ storage_bucket: "interview-papers", storage_path: String(u.storage_path) });

      }

    }

  }



  let ok = 0;

  let skip = 0;

  let fail = 0;



  for (const row of tasks) {

    const label = `${row.storage_bucket}/${row.storage_path}`;

    try {

      if (await existsOnS3(row.storage_bucket, row.storage_path)) {

        skip += 1;

        console.log(`skip (already in S3): ${label}`);

        continue;

      }



      const { data, foundOn } = await readSource(row.storage_bucket, row.storage_path);

      if (!data?.length) {

        fail += 1;

        const hint =

          sourceBackend === "auto"

            ? "missing on all sources (local-disk, vercel-blob)"

            : `missing on ${sourceBackend}`;

        console.warn(`${hint}: ${label}`);

        continue;

      }



      if (dryRun) {

        ok += 1;

        console.log(`dry-run would upload: ${label} (${data.length} bytes, from ${foundOn})`);

        continue;

      }



      await uploadToS3(row.storage_bucket, row.storage_path, data);

      ok += 1;

      console.log(`uploaded: ${label} (from ${foundOn})`);

    } catch (e) {

      fail += 1;

      console.error(`failed: ${label}`, e instanceof Error ? e.message : e);

    }

  }



  console.log(`\nDone. uploaded=${ok} skipped=${skip} failed=${fail} dryRun=${dryRun}`);

  if (fail > 0) {

    console.log(

      "\nTip: failed rows need re-upload via the class editor (files were lost from ephemeral Vercel disk).",

    );

  }

  await pool.end();

}



main().catch((e) => {

  console.error(e);

  process.exit(1);

});


