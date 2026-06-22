import { createFileRoute } from "@tanstack/react-router";
import { handleDeprecatedCronHook } from "@/lib/deprecated-cron-hook.server";
import { runWeeklyCeoSummary } from "@/lib/email/triggers.server";

export const Route = createFileRoute("/api/public/hooks/weekly-summary")({
  server: {
    handlers: {
      POST: async ({ request }) => handleDeprecatedCronHook(request, () => runWeeklyCeoSummary()),
    },
  },
});
