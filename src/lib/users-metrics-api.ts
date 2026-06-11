import { fetchUserMetricsMapFn } from "@/lib/users-metrics.functions";

export interface UserMetrics {
  completion: number;
  avgScore: number;
  modulesDone: number;
  modulesTotal: number;
  quizzesTaken: number;
  overdue: number;
  status: "Active" | "At Risk" | "Needs Attention";
}

export async function fetchUserMetricsMap(): Promise<Map<string, UserMetrics>> {
  const record = await fetchUserMetricsMapFn();
  return new Map(Object.entries(record));
}
