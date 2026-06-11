import type { AssetBucket } from "./asset-storage.shared";

export type { AssetBucket };

export function assetPublicUrl(bucket: AssetBucket, storagePath: string): string {
  const encoded = storagePath.split("/").map(encodeURIComponent).join("/");
  return `/api/assets/${bucket}/${encoded}`;
}
