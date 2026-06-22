import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { deleteAssetFile } from "@/lib/asset-storage.server";
import type { AssetBucket } from "@/lib/asset-storage.shared";
import { userFromAssetRequest } from "@/lib/asset-auth.server";

const BUCKETS = new Set<string>(["class-videos", "class-documents", "class-transcripts"]);

const DeleteBodySchema = z.object({
  bucket: z.enum(["class-videos", "class-documents", "class-transcripts"]),
  path: z.string().min(1).max(500),
});

export const Route = createFileRoute("/api/internal/assets/delete")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          await userFromAssetRequest(request);

          const body = DeleteBodySchema.parse(await request.json());
          if (!BUCKETS.has(body.bucket)) {
            return Response.json({ error: "Invalid delete" }, { status: 400 });
          }

          await deleteAssetFile(body.bucket as AssetBucket, body.path);
          return Response.json({ ok: true });
        } catch (err) {
          if (err instanceof z.ZodError) {
            return Response.json({ error: "Invalid request body" }, { status: 400 });
          }
          const message = err instanceof Error ? err.message : "Delete failed";
          const status = message.toLowerCase().includes("unauthorized") ? 401 : 500;
          return Response.json({ error: message }, { status });
        }
      },
    },
  },
});
