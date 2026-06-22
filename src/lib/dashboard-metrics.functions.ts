import { createServerFn } from "@tanstack/react-start";
import { requireHiringRead } from "@/integrations/neon/auth-middleware";
import { fetchDashboardMetricsFromDb } from "@/lib/dashboard-metrics.server";

export const fetchDashboardMetricsFn = createServerFn({ method: "GET" })
  .middleware([requireHiringRead])
  .handler(async () => fetchDashboardMetricsFromDb());
