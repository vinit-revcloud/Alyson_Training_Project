import { createServerFn } from "@tanstack/react-start";
import { requireDbAuth } from "@/integrations/neon/auth-middleware";
import { getUserRoles } from "@/lib/auth-bootstrap.server";
import {
  fetchCandidateReportRows,
  fetchHiringFunnelMetrics,
} from "@/lib/hiring/hiring-reports.server";

async function assertHiringReportAccess(userId: string): Promise<void> {
  const roles = await getUserRoles(userId);
  const allowed = roles.some((r) =>
    ["admin", "trainer", "hiring_manager", "ceo"].includes(r),
  );
  if (!allowed) throw new Error("Not authorized to view hiring reports.");
}

export const fetchHiringFunnelFn = createServerFn({ method: "GET" })
  .middleware([requireDbAuth])
  .handler(async ({ context }) => {
    await assertHiringReportAccess(context.userId);
    return fetchHiringFunnelMetrics();
  });

export const fetchCandidateReportsFn = createServerFn({ method: "GET" })
  .middleware([requireDbAuth])
  .handler(async ({ context }) => {
    await assertHiringReportAccess(context.userId);
    return fetchCandidateReportRows();
  });
