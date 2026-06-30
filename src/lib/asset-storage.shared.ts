export type AssetBucket =
  | "class-videos"
  | "class-documents"
  | "class-transcripts"
  | "interview-papers";

export function assetPublicUrl(bucket: AssetBucket, storagePath: string): string {
  const encoded = storagePath.split("/").map(encodeURIComponent).join("/");
  return `/api/assets/${bucket}/${encoded}`;
}
