import { createFileRoute } from "@tanstack/react-router";
import { handleDeprecatedCronHook } from "@/lib/deprecated-cron-hook.server";
import { runEscalations } from "@/lib/email/triggers.server";

export const Route = createFileRoute("/api/public/hooks/escalations")({
  server: {
    handlers: {
      POST: async ({ request }) => handleDeprecatedCronHook(request, () => runEscalations()),
    },
  },
});
