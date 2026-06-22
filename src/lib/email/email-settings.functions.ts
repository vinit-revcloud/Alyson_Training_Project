import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireDbAuth, requireHiringRead } from "@/integrations/neon/auth-middleware";
import { requireAdminUserId } from "@/lib/auth-token.server";
import {
  getEmailWorkspaceSettings,
  saveEmailWorkspaceSettings,
  type EmailWorkspaceSettings,
} from "@/lib/email/email-settings.server";
import {
  fetchEmailHealthSummary,
  fetchEmailMetricsFromDb,
} from "@/lib/email/email-metrics.server";
import { processEmailQueueNow } from "@/lib/email/queue-process.server";

const SettingsSchema = z.object({
  notifyOnFailure: z.boolean(),
  weeklyCeoSummary: z.boolean(),
  retakeDeadlineAlert: z.boolean(),
  reminderDueWithinDays: z.number().int().min(1).max(14),
});

export const getEmailSettingsFn = createServerFn({ method: "GET" })
  .middleware([requireDbAuth])
  .handler(async () => {
    await requireAdminUserId();
    return getEmailWorkspaceSettings();
  });

export const saveEmailSettingsFn = createServerFn({ method: "POST" })
  .middleware([requireDbAuth])
  .inputValidator((data: unknown) => SettingsSchema.parse(data))
  .handler(async ({ data }) => {
    await requireAdminUserId();
    await saveEmailWorkspaceSettings(data as EmailWorkspaceSettings);
    return { ok: true as const };
  });

export const fetchEmailMetricsFn = createServerFn({ method: "GET" })
  .middleware([requireDbAuth])
  .handler(async () => {
    await requireAdminUserId();
    return fetchEmailMetricsFromDb();
  });

export const fetchEmailHealthFn = createServerFn({ method: "GET" })
  .middleware([requireDbAuth])
  .handler(async () => {
    await requireAdminUserId();
    return fetchEmailHealthSummary();
  });

/** Manual dev queue drain (Settings / Notifications). Production uses AWS Step Functions. */
export const processEmailQueueFn = createServerFn({ method: "POST" })
  .middleware([requireDbAuth])
  .handler(async () => {
    await requireAdminUserId();
    return processEmailQueueNow();
  });

/** Delivery stats for platform Analytics (trainers, hiring managers, admins, CEO). */
export const fetchEmailDeliverySummaryFn = createServerFn({ method: "GET" })
  .middleware([requireHiringRead])
  .handler(async () => {
    const [metrics, health] = await Promise.all([
      fetchEmailMetricsFromDb(),
      fetchEmailHealthSummary(),
    ]);
    return {
      queueDepth: health.queueDepth,
      suppressedCount: health.suppressedCount,
      sent: metrics.sent,
      pending: metrics.pending,
      failed: metrics.failed,
      learnersAtRisk: metrics.learnersAtRisk,
      retakeEligible: metrics.retakeEligible,
      escalationsSent: metrics.escalationsSent,
    };
  });
