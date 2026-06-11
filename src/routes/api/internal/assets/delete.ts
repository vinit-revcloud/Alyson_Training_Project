import { createFileRoute } from "@tanstack/react-router";
import { deleteAssetFile } from "@/lib/asset-storage.server";
import type { AssetBucket } from "@/lib/asset-storage.shared";
import { userFromAssetRequest } from "@/lib/asset-auth.server";

const BUCKETS = new Set<string>(["class-videos", "class-documents", "class-transcripts"]);

export const Route = createFileRoute("/api/internal/assets/delete")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          await userFromAssetRequest(request);

          const body = (await request.json()) as { bucket?: string; path?: string };
          if (!body.bucket || !body.path || !BUCKETS.has(body.bucket)) {
            return Response.json({ error: "Invalid delete" }, { status: 400 });
          }

          await deleteAssetFile(body.bucket as AssetBucket, body.path);
          return Response.json({ ok: true });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Delete failed";
          const status = message.toLowerCase().includes("unauthorized") ? 401 : 500;
          return Response.json({ error: message }, { status });
        }
      },
    },
  },
});
