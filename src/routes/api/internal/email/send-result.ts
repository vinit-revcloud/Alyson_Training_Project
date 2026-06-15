import { createFileRoute } from "@tanstack/react-router";
import { authorizeCronRequest, cronSecretConfigured } from "@/lib/cron-auth.server";
import {
  EmailSendResultSchema,
  recordEmailSendResult,
} from "@/lib/email/send-result.server";

export const Route = createFileRoute("/api/internal/email/send-result")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!cronSecretConfigured()) {
          return Response.json({ error: "CRON_SECRET not configured" }, { status: 500 });
        }
        if (!authorizeCronRequest(request)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        const parsed = EmailSendResultSchema.safeParse(body);
        if (!parsed.success) {
          return Response.json(
            { error: "Invalid request body", details: parsed.error.flatten() },
            { status: 400 },
          );
        }

        try {
          const result = await recordEmailSendResult(parsed.data);
          return Response.json(result);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Internal server error";
          const status = message.includes("not found") ? 404 : 500;
          return Response.json({ error: message }, { status });
        }
      },
    },
  },
});
