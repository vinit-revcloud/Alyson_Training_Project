import type { AssetBucket } from "./asset-storage.shared";

import { getConfiguredAssetStorageBackend, getS3AssetsConfig } from "./config.server";

import {

  deleteFromS3,

  readFromS3,

  uploadToS3,

} from "./asset-s3.server";



export type AssetStorageBackend = "s3" | "vercel-blob" | "local-disk";



function blobToken(): string | undefined {

  return process.env.BLOB_READ_WRITE_TOKEN?.trim() || undefined;

}



function blobPath(bucket: AssetBucket, storagePath: string): string {

  return `${bucket}/${storagePath}`;

}



function resolveBackend(): AssetStorageBackend {

  return getConfiguredAssetStorageBackend();

}



function backendAvailable(backend: AssetStorageBackend): boolean {

  if (backend === "s3") return Boolean(getS3AssetsConfig().bucket);

  if (backend === "vercel-blob") return Boolean(blobToken());

  return true;

}



/** Backends to try when reading (primary first, then fallbacks). */

export function assetReadBackendOrder(primary?: AssetStorageBackend): AssetStorageBackend[] {

  const first = primary ?? resolveBackend();

  const order: AssetStorageBackend[] = [];

  const add = (b: AssetStorageBackend) => {

    if (backendAvailable(b) && !order.includes(b)) order.push(b);

  };

  add(first);

  add("s3");

  add("vercel-blob");

  add("local-disk");

  return order;

}



async function uploadLocal(

  bucket: AssetBucket,

  storagePath: string,

  data: Buffer | Uint8Array,

): Promise<void> {

  const { mkdir, writeFile } = await import("node:fs/promises");

  const path = await import("node:path");

  const ROOT = path.join(process.cwd(), "storage");

  const bucketRoot = path.resolve(ROOT, bucket);

  const full = path.resolve(bucketRoot, storagePath);

  if (full !== bucketRoot && !full.startsWith(`${bucketRoot}${path.sep}`)) {

    throw new Error("Invalid asset path");

  }

  await mkdir(path.dirname(full), { recursive: true });

  await writeFile(full, data);

}



async function readLocal(bucket: AssetBucket, storagePath: string): Promise<Buffer | null> {

  const { readFile } = await import("node:fs/promises");

  const path = await import("node:path");

  const ROOT = path.join(process.cwd(), "storage");

  const bucketRoot = path.resolve(ROOT, bucket);

  const full = path.resolve(bucketRoot, storagePath);

  if (full !== bucketRoot && !full.startsWith(`${bucketRoot}${path.sep}`)) {

    throw new Error("Invalid asset path");

  }

  try {

    return await readFile(full);

  } catch {

    return null;

  }

}



async function deleteLocal(bucket: AssetBucket, storagePath: string): Promise<void> {

  const { rm } = await import("node:fs/promises");

  const path = await import("node:path");

  const ROOT = path.join(process.cwd(), "storage");

  const bucketRoot = path.resolve(ROOT, bucket);

  const full = path.resolve(bucketRoot, storagePath);

  try {

    await rm(full, { force: true });

  } catch {

    /* ignore */

  }

}



async function uploadBlob(

  bucket: AssetBucket,

  storagePath: string,

  data: Buffer | Uint8Array,

): Promise<void> {

  const token = blobToken();

  if (!token) throw new Error("BLOB_READ_WRITE_TOKEN is not configured");

  const { put } = await import("@vercel/blob");

  await put(blobPath(bucket, storagePath), data, {

    access: "public",

    token,

    addRandomSuffix: false,

  });

}



async function readBlob(bucket: AssetBucket, storagePath: string): Promise<Buffer | null> {

  const token = blobToken();

  if (!token) return null;

  const { head } = await import("@vercel/blob");

  const meta = await head(blobPath(bucket, storagePath), { token }).catch(() => null);

  if (!meta?.url) return null;

  const res = await fetch(meta.url);

  if (!res.ok) return null;

  return Buffer.from(await res.arrayBuffer());

}



/** Public Blob URL when the object exists (uploads use access: public). */

export async function getBlobPublicUrl(

  bucket: AssetBucket,

  storagePath: string,

): Promise<string | null> {

  const token = blobToken();

  if (!token) return null;

  const { head } = await import("@vercel/blob");

  const meta = await head(blobPath(bucket, storagePath), { token }).catch(() => null);

  return meta?.url ?? null;

}



async function deleteBlob(bucket: AssetBucket, storagePath: string): Promise<void> {

  const token = blobToken();

  if (!token) return;

  const { del } = await import("@vercel/blob");

  await del(blobPath(bucket, storagePath), { token }).catch(() => undefined);

}



function assertPersistentUploadBackend(backend: AssetStorageBackend): void {

  if (backend !== "local-disk") return;

  if (process.env.VERCEL) {

    throw new Error(

      "Asset storage is not persistent on Vercel. Set S3_ASSETS_BUCKET (recommended) or BLOB_READ_WRITE_TOKEN.",

    );

  }

}



export async function uploadAssetFile(

  bucket: AssetBucket,

  storagePath: string,

  data: Buffer | Uint8Array,

  mimeType?: string | null,

): Promise<void> {

  const backend = resolveBackend();

  assertPersistentUploadBackend(backend);

  if (backend === "s3") {

    await uploadToS3(bucket, storagePath, data, mimeType);

    return;

  }

  if (backend === "vercel-blob") {

    await uploadBlob(bucket, storagePath, data);

    return;

  }

  await uploadLocal(bucket, storagePath, data);

}



export async function readAssetFileFromBackend(

  backend: AssetStorageBackend,

  bucket: AssetBucket,

  storagePath: string,

): Promise<Buffer | null> {

  if (backend === "s3") return readFromS3(bucket, storagePath);

  if (backend === "vercel-blob") return readBlob(bucket, storagePath);

  return readLocal(bucket, storagePath);

}



/** Read from primary backend, then fall back across S3 / Blob / local disk. */

export async function readAssetFile(bucket: AssetBucket, storagePath: string): Promise<Buffer | null> {

  for (const backend of assetReadBackendOrder()) {

    const data = await readAssetFileFromBackend(backend, bucket, storagePath);

    if (data?.length) return data;

  }

  return null;

}



/** Which backend actually served the file (for diagnostics). */

export async function locateAssetFile(

  bucket: AssetBucket,

  storagePath: string,

): Promise<{ backend: AssetStorageBackend; data: Buffer } | null> {

  for (const backend of assetReadBackendOrder()) {

    const data = await readAssetFileFromBackend(backend, bucket, storagePath);

    if (data?.length) return { backend, data };

  }

  return null;

}



export async function deleteAssetFile(bucket: AssetBucket, storagePath: string): Promise<void> {

  const backend = resolveBackend();

  if (backend === "s3") {

    await deleteFromS3(bucket, storagePath);

    return;

  }

  if (backend === "vercel-blob") {

    await deleteBlob(bucket, storagePath);

    return;

  }

  await deleteLocal(bucket, storagePath);

}



export function assetStorageBackend(): AssetStorageBackend {

  return resolveBackend();

}



export function assetStorageUsesS3(): boolean {

  return resolveBackend() === "s3";

}



export function blobStorageConfigured(): boolean {

  return Boolean(blobToken());

}



export function s3StorageConfigured(): boolean {

  return Boolean(getS3AssetsConfig().bucket);

}


