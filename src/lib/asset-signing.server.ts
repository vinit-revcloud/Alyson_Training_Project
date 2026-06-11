import { createHmac, timingSafeEqual } from "node:crypto";
import type { AssetBucket } from "./asset-storage.shared";
import { assetPublicUrl } from "./asset-storage.shared";

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

/** Build a time-limited asset URL (HMAC signed). */
export function signAssetUrl(
  bucket: AssetBucket,
  storagePath: string,
  expiresInSeconds = 3600,
): string {
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const sig = signPayload(bucket, storagePath, exp);
  const base = assetPublicUrl(bucket, storagePath);
  return `${base}?exp=${exp}&sig=${encodeURIComponent(sig)}`;
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

export function assetUrlsRequireSignature(): boolean {
  return process.env.NODE_ENV === "production";
}
