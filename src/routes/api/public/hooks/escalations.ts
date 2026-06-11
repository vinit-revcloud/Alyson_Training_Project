import { createFileRoute } from "@tanstack/react-router";
import { authorizeCronRequest } from "@/lib/cron-auth.server";
import { runEscalations } from "@/lib/email/triggers.server";

export const Route = createFileRoute("/api/public/hooks/escalations")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!authorizeCronRequest(request)) {
          return new Response("Unauthorized", { status: 401 });
        }
        const r = await runEscalations();
        return Response.json({ ok: true, ...r });
      },
    },
  },
});
