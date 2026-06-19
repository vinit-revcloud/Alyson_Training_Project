import type { AssetBucket } from "./asset-storage.shared";

function blobToken(): string | undefined {
  return process.env.BLOB_READ_WRITE_TOKEN?.trim() || undefined;
}

function blobPath(bucket: AssetBucket, storagePath: string): string {
  return `${bucket}/${storagePath}`;
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

export async function uploadAssetFile(
  bucket: AssetBucket,
  storagePath: string,
  data: Buffer | Uint8Array,
): Promise<void> {
  const token = blobToken();
  if (token) {
    const { put } = await import("@vercel/blob");
    await put(blobPath(bucket, storagePath), data, {
      access: "public",
      token,
      addRandomSuffix: false,
    });
    return;
  }
  await uploadLocal(bucket, storagePath, data);
}

export async function readAssetFile(bucket: AssetBucket, storagePath: string): Promise<Buffer | null> {
  const token = blobToken();
  if (token) {
    const { head } = await import("@vercel/blob");
    const meta = await head(blobPath(bucket, storagePath), { token }).catch(() => null);
    if (!meta?.url) return null;
    const res = await fetch(meta.url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  }
  return readLocal(bucket, storagePath);
}

export async function deleteAssetFile(bucket: AssetBucket, storagePath: string): Promise<void> {
  const token = blobToken();
  if (token) {
    const { del } = await import("@vercel/blob");
    await del(blobPath(bucket, storagePath), { token }).catch(() => undefined);
    return;
  }
  await deleteLocal(bucket, storagePath);
}

export function assetStorageBackend(): "vercel-blob" | "local-disk" {
  return blobToken() ? "vercel-blob" : "local-disk";
}
