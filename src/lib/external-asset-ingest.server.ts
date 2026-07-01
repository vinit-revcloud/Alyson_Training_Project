import { uploadAssetFile } from "@/lib/asset-storage.server";
import type { AssetBucket } from "@/lib/asset-storage.shared";

const FETCH_TIMEOUT_MS = 30_000;
const MAX_BYTES = 10 * 1024 * 1024;

function bucketForKind(kind: "document" | "transcript"): AssetBucket {
  return kind === "document" ? "class-documents" : "class-transcripts";
}

function fileNameFromUrl(url: string, fallback: string): string {
  try {
    const segment = new URL(url).pathname.split("/").filter(Boolean).pop();
    return segment && segment.length > 0 ? decodeURIComponent(segment) : fallback;
  } catch {
    return fallback;
  }
}

function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_.-]/g, "_");
}

/** Fetch a public HTTP(S) URL; returns null when unreachable or too large. */
export async function fetchExternalAssetBytes(url: string): Promise<Buffer | null> {
  const trimmed = url.trim();
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(trimmed, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "AlysonTrainingAssetIngest/1.0" },
    });
    if (!res.ok) return null;

    const length = Number(res.headers.get("content-length") ?? 0);
    if (length > MAX_BYTES) return null;

    const arrayBuffer = await res.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_BYTES) return null;
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export interface IngestedExternalAsset {
  storageBucket: AssetBucket;
  storagePath: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number;
}

/** Download a fetchable URL and upload to S3/local storage; null when ingest fails. */
export async function ingestExternalAssetUrl(input: {
  classId: string;
  sectionId: string;
  kind: "document" | "transcript";
  url: string;
  fileName?: string;
}): Promise<IngestedExternalAsset | null> {
  const data = await fetchExternalAssetBytes(input.url);
  if (!data?.length) return null;

  const fallback = input.kind === "transcript" ? "transcript.txt" : "document.pdf";
  const fileName = input.fileName?.trim() || fileNameFromUrl(input.url, fallback);
  const safe = safeFileName(fileName);
  const storagePath = `${input.classId}/${input.sectionId}/${Date.now()}-${safe}`;
  const bucket = bucketForKind(input.kind);

  await uploadAssetFile(bucket, storagePath, data, null);

  return {
    storageBucket: bucket,
    storagePath,
    fileName,
    mimeType: null,
    sizeBytes: data.length,
  };
}
