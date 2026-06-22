import { createFileRoute } from "@tanstack/react-router";
import { handleDeprecatedCronHook } from "@/lib/deprecated-cron-hook.server";
import { runRetryFailed } from "@/lib/email/triggers.server";

export const Route = createFileRoute("/api/public/hooks/retry-failed")({
  server: {
    handlers: {
      POST: async ({ request }) => handleDeprecatedCronHook(request, () => runRetryFailed()),
    },
  },
});
