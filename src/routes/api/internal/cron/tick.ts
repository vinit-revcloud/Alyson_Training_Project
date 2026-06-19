import { createFileRoute } from "@tanstack/react-router";
import { authorizeCronRequest, cronSecretConfigured } from "@/lib/cron-auth.server";
import { runCronTick } from "@/lib/email/cron-runner.server";

async function handleCronTick(request: Request): Promise<Response> {
  if (!cronSecretConfigured()) {
    return Response.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (!authorizeCronRequest(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runCronTick();
  return Response.json(result);
}

export const Route = createFileRoute("/api/internal/cron/tick")({
  server: {
    handlers: {
      /** Vercel Cron invokes scheduled jobs with GET. */
      GET: async ({ request }) => handleCronTick(request),
      POST: async ({ request }) => handleCronTick(request),
    },
  },
});
