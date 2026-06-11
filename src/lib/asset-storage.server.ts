import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AssetBucket } from "./asset-storage.shared";

const ROOT = path.join(process.cwd(), "storage");

function resolvePath(bucket: AssetBucket, storagePath: string): string {
  const bucketRoot = path.resolve(ROOT, bucket);
  const full = path.resolve(bucketRoot, storagePath);
  if (full !== bucketRoot && !full.startsWith(`${bucketRoot}${path.sep}`)) {
    throw new Error("Invalid asset path");
  }
  return full;
}

export async function uploadAssetFile(
  bucket: AssetBucket,
  storagePath: string,
  data: Buffer | Uint8Array,
): Promise<void> {
  const full = resolvePath(bucket, storagePath);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, data);
}

export async function readAssetFile(bucket: AssetBucket, storagePath: string): Promise<Buffer | null> {
  try {
    return await readFile(resolvePath(bucket, storagePath));
  } catch {
    return null;
  }
}

export async function deleteAssetFile(bucket: AssetBucket, storagePath: string): Promise<void> {
  try {
    await rm(resolvePath(bucket, storagePath), { force: true });
  } catch {
    /* ignore */
  }
}
