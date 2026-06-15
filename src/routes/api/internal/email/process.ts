import { createFileRoute } from "@tanstack/react-router";
import { authorizeCronRequest, cronSecretConfigured } from "@/lib/cron-auth.server";
/** Manual dev drain only — production sends via AWS Step Functions. */
import { processEmailQueue } from "@/lib/email/process-queue";

export const Route = createFileRoute("/api/internal/email/process")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!cronSecretConfigured()) {
          return Response.json({ error: "CRON_SECRET not configured" }, { status: 500 });
        }
        if (!authorizeCronRequest(request)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        const result = await processEmailQueue();
        return Response.json(result);
      },
    },
  },
});
