import { createFileRoute } from "@tanstack/react-router";
import { uploadAssetFile } from "@/lib/asset-storage.server";
import type { AssetBucket } from "@/lib/asset-storage.shared";
import { assertUploadSize } from "@/lib/asset-upload-limits";
import { assertSectionExistsForUpload, assertInterviewPaperUploadPath } from "@/lib/asset-ownership.server";
import { userFromAssetRequest } from "@/lib/asset-auth.server";

const BUCKETS = new Set<string>(["class-videos", "class-documents", "class-transcripts", "interview-papers"]);

export const Route = createFileRoute("/api/internal/assets/upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          await userFromAssetRequest(request);

          const form = await request.formData();
          const file = form.get("file");
          const bucket = String(form.get("bucket") ?? "");
          const storagePath = String(form.get("path") ?? "");
          if (!(file instanceof File) || !BUCKETS.has(bucket) || !storagePath) {
            return Response.json({ error: "Invalid upload" }, { status: 400 });
          }

          assertUploadSize(bucket as AssetBucket, file.size);
          if (bucket === "interview-papers") {
            await assertInterviewPaperUploadPath(storagePath);
          } else {
            await assertSectionExistsForUpload(storagePath);
          }

          const buffer = Buffer.from(await file.arrayBuffer());
          await uploadAssetFile(bucket as AssetBucket, storagePath, buffer, file.type || null);
          return Response.json({ ok: true, path: storagePath });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Upload failed";
          const status = message.toLowerCase().includes("unauthorized")
            ? 401
            : message.toLowerCase().includes("too large") || message.includes("Invalid")
              ? 400
              : 500;
          return Response.json({ error: message }, { status });
        }
      },
    },
  },
});
