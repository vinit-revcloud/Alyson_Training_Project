import { createFileRoute } from "@tanstack/react-router";
import { authorizeCronRequest, cronSecretConfigured } from "@/lib/cron-auth.server";
import { runCronTick } from "@/lib/email/cron-runner.server";

export const Route = createFileRoute("/api/internal/cron/tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!cronSecretConfigured()) {
          return Response.json({ error: "CRON_SECRET not configured" }, { status: 500 });
        }
        if (!authorizeCronRequest(request)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        const result = await runCronTick();
        return Response.json(result);
      },
    },
  },
});
