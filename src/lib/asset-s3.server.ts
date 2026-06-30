import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { AssetBucket } from "@/lib/asset-storage.shared";
import { getS3AssetsConfig } from "@/lib/config.server";

let s3Client: S3Client | null = null;

function client(): S3Client {
  if (!s3Client) {
    const cfg = getS3AssetsConfig();
    s3Client = new S3Client({
      region: cfg.region,
      credentials:
        cfg.accessKeyId && cfg.secretAccessKey
          ? { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey }
          : undefined,
    });
  }
  return s3Client;
}

/** S3 object key: optional global prefix + logical bucket + storage path. */
export function s3ObjectKey(bucket: AssetBucket, storagePath: string): string {
  const cfg = getS3AssetsConfig();
  const prefix = cfg.keyPrefix ? `${cfg.keyPrefix.replace(/\/$/, "")}/` : "";
  return `${prefix}${bucket}/${storagePath}`;
}

export function contentTypeForPath(storagePath: string, mimeType?: string | null): string {
  if (mimeType?.trim()) return mimeType.trim();
  const ext = storagePath.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    mp4: "video/mp4",
    webm: "video/webm",
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    txt: "text/plain; charset=utf-8",
    md: "text/markdown; charset=utf-8",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
  };
  return map[ext] ?? "application/octet-stream";
}

export async function uploadToS3(
  bucket: AssetBucket,
  storagePath: string,
  data: Buffer | Uint8Array,
  mimeType?: string | null,
): Promise<void> {
  const cfg = getS3AssetsConfig();
  if (!cfg.bucket) throw new Error("S3_ASSETS_BUCKET is not configured");

  const contentType = contentTypeForPath(storagePath, mimeType);
  const isPdf = contentType === "application/pdf";

  await client().send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: s3ObjectKey(bucket, storagePath),
      Body: data,
      ContentType: contentType,
      ...(isPdf ? { ContentDisposition: "inline" } : {}),
    }),
  );
}

export async function s3BucketReachable(): Promise<boolean> {
  const cfg = getS3AssetsConfig();
  if (!cfg.bucket) return false;

  try {
    await client().send(new HeadBucketCommand({ Bucket: cfg.bucket }));
    return true;
  } catch {
    return false;
  }
}

export async function objectExistsOnS3(bucket: AssetBucket, storagePath: string): Promise<boolean> {
  const cfg = getS3AssetsConfig();
  if (!cfg.bucket) return false;

  try {
    await client().send(
      new HeadObjectCommand({
        Bucket: cfg.bucket,
        Key: s3ObjectKey(bucket, storagePath),
      }),
    );
    return true;
  } catch {
    return false;
  }
}

export async function readFromS3(bucket: AssetBucket, storagePath: string): Promise<Buffer | null> {
  const cfg = getS3AssetsConfig();
  if (!cfg.bucket) return null;

  try {
    const res = await client().send(
      new GetObjectCommand({
        Bucket: cfg.bucket,
        Key: s3ObjectKey(bucket, storagePath),
      }),
    );
    if (!res.Body) return null;
    const bytes = await res.Body.transformToByteArray();
    return Buffer.from(bytes);
  } catch {
    return null;
  }
}

export async function deleteFromS3(bucket: AssetBucket, storagePath: string): Promise<void> {
  const cfg = getS3AssetsConfig();
  if (!cfg.bucket) return;

  await client()
    .send(
      new DeleteObjectCommand({
        Bucket: cfg.bucket,
        Key: s3ObjectKey(bucket, storagePath),
      }),
    )
    .catch(() => undefined);
}

export async function createS3PresignedGetUrl(
  bucket: AssetBucket,
  storagePath: string,
  expiresInSeconds: number,
): Promise<string> {
  const cfg = getS3AssetsConfig();
  if (!cfg.bucket) throw new Error("S3_ASSETS_BUCKET is not configured");

  return getSignedUrl(
    client(),
    new GetObjectCommand({
      Bucket: cfg.bucket,
      Key: s3ObjectKey(bucket, storagePath),
    }),
    { expiresIn: expiresInSeconds },
  );
}
