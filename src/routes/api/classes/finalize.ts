import { createFileRoute } from "@tanstack/react-router";
import { assertContentManager } from "@/lib/content-manager.server";
import {
  FinalizeClassInputSchema,
  runFinalizeClassCreation,
} from "@/lib/class-finalize.functions";
import { userFromRequest } from "@/lib/auth-token.server";

export const Route = createFileRoute("/api/classes/finalize")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const authUser = await userFromRequest(request);
          await assertContentManager(authUser.id);
          const body = FinalizeClassInputSchema.parse(await request.json());
          const result = await runFinalizeClassCreation(body);
          return Response.json(result);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Finalize class failed";
          const status = message.includes("Unauthorized")
            ? 401
            : message.includes("Not authorized") || message.includes("Forbidden")
              ? 403
              : 500;
          return Response.json({ error: message }, { status });
        }
      },
    },
  },
});
