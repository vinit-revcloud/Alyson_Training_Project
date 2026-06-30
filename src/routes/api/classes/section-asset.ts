import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { assertContentManager } from "@/lib/content-manager.server";
import { insertSectionAssetInDb } from "@/lib/classes.server";
import { cacheExtractedTextForSectionAsset } from "@/lib/asset-extract-cache.server";
import { userFromRequest } from "@/lib/auth-token.server";

const BodySchema = z.object({
  sectionId: z.string().uuid(),
  kind: z.enum(["video", "document", "transcript"]),
  storageBucket: z
    .enum(["class-videos", "class-documents", "class-transcripts"])
    .nullable()
    .optional(),
  storagePath: z.string().max(500).nullable().optional(),
  externalUrl: z.string().max(2000).nullable().optional(),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().max(120).nullable().optional(),
  sizeBytes: z.number().int().nonnegative().nullable().optional(),
});

export const Route = createFileRoute("/api/classes/section-asset")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const authUser = await userFromRequest(request);
          await assertContentManager(authUser.id);
          const body = BodySchema.parse(await request.json());
          const id = await insertSectionAssetInDb(body);
          try {
            await cacheExtractedTextForSectionAsset({
              assetId: id,
              kind: body.kind,
              fileName: body.fileName,
              storageBucket: body.storageBucket ?? null,
              storagePath: body.storagePath ?? null,
            });
          } catch {
            /* extraction is best-effort; gatherSectionMaterial will retry */
          }
          return Response.json({ id });
        } catch (err) {
          if (err instanceof z.ZodError) {
            return Response.json({ error: "Invalid request body" }, { status: 400 });
          }
          const message = err instanceof Error ? err.message : "Insert asset failed";
          const status = message.includes("Unauthorized")
            ? 401
            : message.includes("Not authorized")
              ? 403
              : 500;
          return Response.json({ error: message }, { status });
        }
      },
    },
  },
});
