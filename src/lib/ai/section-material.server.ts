import type { DbAdminClient } from "@/integrations/neon/client-types";
import { readAssetFile } from "@/lib/asset-storage.server";
import type { AssetBucket } from "@/lib/asset-storage.shared";
import { extractTextFromBuffer, isTextExtractableFileName } from "./extract-material.server";

type AdminClient = DbAdminClient;

export interface SectionMaterialResult {
  materialText: string;
  fileNames: string[];
}

interface AssetRow {
  id: string;
  kind: string;
  storage_bucket: string | null;
  storage_path: string | null;
  external_url: string | null;
  file_name: string;
  extracted_text: string | null;
}

/**
 * Build knowledge-base text for a section from transcripts, documents, and cached extractions.
 * Skips video files (use transcripts instead). Updates section_assets.extracted_text when parsed.
 */
export async function gatherSectionMaterial(
  supabase: AdminClient,
  section: { id: string; title: string; description: string; objectives: string },
  opts?: { maxChars?: number },
): Promise<SectionMaterialResult> {
  const maxChars = opts?.maxChars ?? 40_000;
  const { data: assets } = await supabase
    .from("section_assets")
    .select("id, kind, storage_bucket, storage_path, external_url, file_name, extracted_text")
    .eq("section_id", section.id);

  let materialText = `# ${section.title}\n${section.description ?? ""}\nObjectives: ${section.objectives ?? ""}\n\n`;
  const fileNames: string[] = [];

  for (const a of (assets ?? []) as AssetRow[]) {
    if (a.kind === "video_link" && a.external_url?.trim()) {
      fileNames.push(a.file_name || "video-link");
      materialText += `\n\n--- Video (link) ---\n${a.external_url.trim()}\n`;
      continue;
    }
    if (
      (a.kind === "document" || a.kind === "transcript") &&
      a.external_url?.trim() &&
      !a.storage_path
    ) {
      fileNames.push(a.file_name || a.kind);
      materialText += `\n\n--- ${a.kind === "transcript" ? "Transcript" : "Document"} (link) ---\n${a.external_url.trim()}\n`;
      continue;
    }
    if (a.kind === "video") continue;
    fileNames.push(a.file_name);

    if (a.extracted_text?.trim()) {
      materialText += `\n\n--- ${a.file_name} ---\n${a.extracted_text.slice(0, 12_000)}`;
      if (materialText.length >= maxChars) break;
      continue;
    }

    if (!a.storage_bucket || !a.storage_path || !isTextExtractableFileName(a.file_name)) continue;

    try {
      const file = await readAssetFile(a.storage_bucket as AssetBucket, a.storage_path);
      if (!file) continue;

      const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
      const text = await extractTextFromBuffer(a.file_name, buffer);
      if (!text.trim()) continue;

      await supabase
        .from("section_assets")
        .update({ extracted_text: text.slice(0, 120_000), extracted_at: new Date().toISOString() })
        .eq("id", a.id);

      materialText += `\n\n--- ${a.file_name} ---\n${text.slice(0, 12_000)}`;
      if (materialText.length >= maxChars) break;
    } catch {
      /* skip unreadable asset */
    }
  }

  return { materialText: materialText.slice(0, maxChars), fileNames };
}

export async function gatherClassMaterial(
  supabase: AdminClient,
  classId: string,
): Promise<SectionMaterialResult> {
  const { data: cls } = await supabase
    .from("classes")
    .select("name, summary, audience, topics")
    .eq("id", classId)
    .maybeSingle();

  const { data: sections } = await supabase
    .from("sections")
    .select("id, title, description, objectives")
    .eq("class_id", classId)
    .order("position", { ascending: true });

  let materialText = [
    `# ${cls?.name ?? "Class"}`,
    cls?.summary ? `Summary: ${cls.summary}` : "",
    cls?.audience ? `Audience: ${cls.audience}` : "",
    cls?.topics?.length ? `Topics: ${(cls.topics as string[]).join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const fileNames: string[] = [];

  for (const sec of sections ?? []) {
    const part = await gatherSectionMaterial(supabase, sec, { maxChars: 15_000 });
    materialText += `\n\n${part.materialText}`;
    fileNames.push(...part.fileNames);
  }

  return { materialText: materialText.slice(0, 60_000), fileNames };
}
