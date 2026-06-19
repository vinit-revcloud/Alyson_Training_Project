import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { assertContentManager } from "@/lib/content-manager.server";
import { insertSectionAssetInDb } from "@/lib/classes.server";
import { userFromRequest } from "@/lib/auth-token.server";

const BodySchema = z.object({
  sectionId: z.string().uuid(),
  kind: z.string(),
  storageBucket: z.string().nullable().optional(),
  storagePath: z.string().nullable().optional(),
  externalUrl: z.string().nullable().optional(),
  fileName: z.string(),
  mimeType: z.string().nullable().optional(),
  sizeBytes: z.number().int().nullable().optional(),
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
          return Response.json({ id });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Insert asset failed";
          const status = message.includes("Unauthorized") ? 401 : 500;
          return Response.json({ error: message }, { status });
        }
      },
    },
  },
});
