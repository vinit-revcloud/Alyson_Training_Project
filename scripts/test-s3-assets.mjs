/**

 * Verify S3 bucket credentials and region (loads .env from project root).

 *

 * Usage: node scripts/test-s3-assets.mjs

 */



import { readFileSync } from "node:fs";

import { resolve, dirname } from "node:path";

import { fileURLToPath } from "node:url";

import process from "node:process";

import { HeadBucketCommand, PutObjectCommand, DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";



const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");



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



const bucket = process.env.S3_ASSETS_BUCKET?.trim();

const region = process.env.S3_ASSETS_REGION?.trim() || process.env.AWS_REGION || "us-west-2";



if (!bucket) {

  console.error("S3_ASSETS_BUCKET is not set");

  process.exit(1);

}

if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {

  console.error("AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required");

  process.exit(1);

}



const s3 = new S3Client({

  region,

  credentials: {

    accessKeyId: process.env.AWS_ACCESS_KEY_ID,

    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,

  },

});



const probeKey = `${process.env.S3_ASSETS_PREFIX?.trim().replace(/^\//, "").replace(/\/$/, "") ? `${process.env.S3_ASSETS_PREFIX.trim().replace(/^\//, "").replace(/\/$/, "")}/` : ""}__probe__/write-test.txt`;



async function main() {

  console.log(`Bucket: ${bucket}`);

  console.log(`Region: ${region}`);

  console.log(`Backend: ${process.env.ASSET_STORAGE_BACKEND ?? "(auto)"}`);



  await s3.send(new HeadBucketCommand({ Bucket: bucket }));

  console.log("HeadBucket: OK");



  await s3.send(

    new PutObjectCommand({

      Bucket: bucket,

      Key: probeKey,

      Body: "alyson-s3-probe",

      ContentType: "text/plain",

    }),

  );

  console.log("PutObject: OK");



  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: probeKey }));

  console.log("DeleteObject: OK");

  console.log("\nS3 is ready for uploads.");

}



main().catch((e) => {

  console.error("\nS3 test failed:", e instanceof Error ? e.message : e);

  console.error("Check S3_ASSETS_REGION matches the bucket region and IAM allows s3:PutObject on this bucket.");

  process.exit(1);

});


