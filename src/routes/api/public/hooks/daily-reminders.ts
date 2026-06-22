import { createFileRoute } from "@tanstack/react-router";
import { handleDeprecatedCronHook } from "@/lib/deprecated-cron-hook.server";
import { runDailyReminders } from "@/lib/email/triggers.server";

export const Route = createFileRoute("/api/public/hooks/daily-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => handleDeprecatedCronHook(request, () => runDailyReminders()),
    },
  },
});
