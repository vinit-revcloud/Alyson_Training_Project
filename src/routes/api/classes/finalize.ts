import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { assertContentManager } from "@/lib/content-manager.server";
import {
  FinalizeClassInputSchema,
  runFinalizeClassCreation,
} from "@/lib/class-finalize.functions";
import { userFromRequest } from "@/lib/auth-token.server";
import { formatErrorMessage } from "@/lib/format-error";

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
          if (err instanceof z.ZodError) {
            return Response.json({ error: "Invalid request body" }, { status: 400 });
          }
          const message = formatErrorMessage(err);
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
