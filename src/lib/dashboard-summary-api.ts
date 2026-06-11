import { fetchDashboardSummaryFn } from "@/lib/dashboard-summary.functions";

export interface DashboardSummary {
  totalUsers: number;
  activeAssignments: number;
  completedAssignments: number;
  avgCompletionPct: number;
  overdueCount: number;
  activeCourses: number;
}

export async function fetchDashboardSummary(): Promise<DashboardSummary> {
  return fetchDashboardSummaryFn();
}
