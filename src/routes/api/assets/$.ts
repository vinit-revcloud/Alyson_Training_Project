import { createFileRoute } from "@tanstack/react-router";
import { readAssetFile } from "@/lib/asset-storage.server";
import type { AssetBucket } from "@/lib/asset-storage.shared";
import { assetUrlsRequireSignature, verifyAssetSignature } from "@/lib/asset-signing.server";

const BUCKETS = new Set<string>(["class-videos", "class-documents", "class-transcripts", "interview-papers"]);

export const Route = createFileRoute("/api/assets/$")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const raw = params._splat ?? "";
        const slash = raw.indexOf("/");
        if (slash < 1) return new Response("Not found", { status: 404 });

        const bucket = raw.slice(0, slash) as AssetBucket;
        const storagePath = decodeURIComponent(raw.slice(slash + 1));
        if (!BUCKETS.has(bucket)) return new Response("Not found", { status: 404 });

        const url = new URL(request.url);
        const exp = url.searchParams.get("exp");
        const sig = url.searchParams.get("sig");

        if (assetUrlsRequireSignature() && !verifyAssetSignature(bucket, storagePath, exp, sig)) {
          return new Response("Forbidden", { status: 403 });
        }

        let file: Buffer | null;
        try {
          file = await readAssetFile(bucket, storagePath);
        } catch {
          return new Response("Not found", { status: 404 });
        }
        if (!file) return new Response("Not found", { status: 404 });

        const ext = storagePath.split(".").pop()?.toLowerCase() ?? "";
        const type =
          ext === "mp4"
            ? "video/mp4"
            : ext === "webm"
              ? "video/webm"
              : ext === "pdf"
                ? "application/pdf"
                : ext === "jpg" || ext === "jpeg"
                  ? "image/jpeg"
                  : ext === "png"
                    ? "image/png"
                    : ext === "webp"
                      ? "image/webp"
                      : ext === "txt" || ext === "srt" || ext === "vtt"
                        ? "text/plain; charset=utf-8"
                        : "application/octet-stream";

        return new Response(file, {
          headers: {
            "Content-Type": type,
            "Cache-Control": "private, max-age=3600",
          },
        });
      },
    },
  },
});
