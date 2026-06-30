import { getPgPool } from "@/lib/pg.server";
import { readAssetFile } from "@/lib/asset-storage.server";
import type { AssetBucket } from "@/lib/asset-storage.shared";
import { extractTextFromBuffer, isTextExtractableFileName } from "@/lib/ai/extract-material.server";

const EXTRACTABLE_KINDS = new Set(["document", "transcript"]);

/** Parse uploaded file once and cache text in section_assets for AI workflows. */
export async function cacheExtractedTextForSectionAsset(input: {
  assetId: string;
  kind: string;
  fileName: string;
  storageBucket: string | null;
  storagePath: string | null;
}): Promise<void> {
  if (!EXTRACTABLE_KINDS.has(input.kind)) return;
  if (!input.storageBucket || !input.storagePath) return;
  if (!isTextExtractableFileName(input.fileName)) return;

  const file = await readAssetFile(input.storageBucket as AssetBucket, input.storagePath);
  if (!file?.length) return;

  const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
  const text = await extractTextFromBuffer(input.fileName, buffer);
  if (!text.trim()) return;

  const pool = getPgPool();
  await pool.query(
    `UPDATE section_assets
     SET extracted_text = $2, extracted_at = now()
     WHERE id = $1`,
    [input.assetId, text.slice(0, 120_000)],
  );
}
