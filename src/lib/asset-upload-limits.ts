import type { AssetBucket } from "@/lib/asset-storage.shared";

const LIMITS: Record<AssetBucket, number> = {
  "class-videos": 50 * 1024 * 1024,
  "class-documents": 10 * 1024 * 1024,
  "class-transcripts": 10 * 1024 * 1024,
  "interview-papers": 15 * 1024 * 1024,
};

export function maxBytesForBucket(bucket: AssetBucket): number {
  return LIMITS[bucket] ?? 10 * 1024 * 1024;
}

export function assertUploadSize(bucket: AssetBucket, sizeBytes: number): void {
  const max = maxBytesForBucket(bucket);
  if (sizeBytes > max) {
    throw new Error(`File too large (max ${Math.round(max / (1024 * 1024))}MB for ${bucket})`);
  }
}

/** Validate storage path format: {classId}/{sectionId}/... */
export function parseClassSectionFromPath(storagePath: string): {
  classId: string;
  sectionId: string;
} | null {
  const parts = storagePath.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuid.test(parts[0]) || !uuid.test(parts[1])) return null;
  return { classId: parts[0], sectionId: parts[1] };
}
