import { createServerFn } from "@tanstack/react-start";
import { requireContentManager } from "@/integrations/neon/auth-middleware";
import { fetchDashboardMetricsFromDb } from "@/lib/dashboard-metrics.server";

export const fetchDashboardMetricsFn = createServerFn({ method: "GET" })
  .middleware([requireContentManager])
  .handler(async () => fetchDashboardMetricsFromDb());
