import { createHmac, timingSafeEqual } from "node:crypto";

import type { AssetBucket } from "./asset-storage.shared";

import { assetPublicUrl } from "./asset-storage.shared";

import {
  assetStorageBackend,
  assetStorageUsesS3,
  getBlobPublicUrl,
  locateAssetFile,
} from "./asset-storage.server";

import { createS3PresignedGetUrl, s3ObjectKey } from "./asset-s3.server";

import { getS3AssetsConfig } from "./config.server";

function signingSecret(): string {
  const secret = process.env.ASSET_SIGNING_SECRET?.trim() || process.env.CRON_SECRET?.trim();
  if (!secret) {
    throw new Error("CRON_SECRET (or ASSET_SIGNING_SECRET) is required to sign asset URLs");
  }
  return secret;
}

function signPayload(bucket: AssetBucket, storagePath: string, exp: number): string {
  return createHmac("sha256", signingSecret())
    .update(`${bucket}:${storagePath}:${exp}`)
    .digest("base64url");
}

function signedAppProxyUrl(
  bucket: AssetBucket,
  storagePath: string,
  expiresInSeconds: number,
): string {
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const sig = signPayload(bucket, storagePath, exp);
  const base = assetPublicUrl(bucket, storagePath);
  return `${base}?exp=${exp}&sig=${encodeURIComponent(sig)}`;
}

function logSignFailure(bucket: AssetBucket, storagePath: string, reason: string): void {
  if (process.env.NODE_ENV === "production") return;
  const cfg = getS3AssetsConfig();
  const prefix = cfg.keyPrefix ? `${cfg.keyPrefix}/` : "";
  console.warn(
    `[asset-sign] ${reason}: bucket=${bucket} key=${prefix}${bucket}/${storagePath} backend=${assetStorageBackend()}`,
  );
}

/** Build a time-limited asset URL (S3 presigned when on S3, else Blob or HMAC app proxy). */
export async function signAssetUrl(
  bucket: AssetBucket,
  storagePath: string,
  expiresInSeconds = 3600,
): Promise<string> {
  // Presign directly in S3 mode — HeadObject is best-effort only (some IAM policies
  // allow GetObject but not HeadObject, which previously caused false "unavailable").
  if (assetStorageUsesS3()) {
    return createS3PresignedGetUrl(bucket, storagePath, expiresInSeconds);
  }

  const blobUrl = await getBlobPublicUrl(bucket, storagePath);
  if (blobUrl) return blobUrl;

  const located = await locateAssetFile(bucket, storagePath);
  if (!located) {
    logSignFailure(bucket, storagePath, "file not found in storage");
    throw new Error("Asset file not found in storage");
  }

  if (located.backend === "s3") {
    return createS3PresignedGetUrl(bucket, storagePath, expiresInSeconds);
  }

  return signedAppProxyUrl(bucket, storagePath, expiresInSeconds);
}

export function verifyAssetSignature(
  bucket: AssetBucket,
  storagePath: string,
  expRaw: string | null,
  sigRaw: string | null,
): boolean {
  if (!expRaw || !sigRaw) return false;

  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;

  let expected: Buffer;
  let provided: Buffer;
  try {
    expected = Buffer.from(signPayload(bucket, storagePath, exp));
    provided = Buffer.from(decodeURIComponent(sigRaw));
  } catch {
    return false;
  }

  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}

/** App proxy requires HMAC in production unless the object is served only via presigned/Blob URL. */
export function assetUrlsRequireSignature(): boolean {
  return process.env.NODE_ENV === "production";
}

/** Full S3 object key for diagnostics (matches upload/read paths). */
export function assetS3ObjectKey(bucket: AssetBucket, storagePath: string): string {
  return s3ObjectKey(bucket, storagePath);
}
