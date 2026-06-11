import { fetchDashboardMetricsFn } from "@/lib/dashboard-metrics.functions";

export interface AtRiskLearner {
  userId: string;
  name: string;
  department: string;
  overdue: number;
  pending: number;
  progressPct: number;
}

export interface TopPerformer {
  userId: string;
  name: string;
  department: string;
  avgScore: number;
  attempts: number;
}

export interface FlaggedQuestion {
  questionId: string;
  prompt: string;
  assessmentId: string | null;
  flags: number;
}

export interface EasyTest {
  assessmentId: string;
  title: string;
  attempts: number;
  avgScore: number;
  perfectPct: number;
}

export interface StudyEffort {
  totalCardsRead: number;
  avgSecondsPerCard: number;
  totalLearners: number;
  trend: { day: string; cards: number; seconds: number }[];
}

export interface DashboardActivityItem {
  kind: string;
  title: string;
  detail: string;
  time: string;
  iconKey: "user" | "assign" | "test" | "alert";
}

export interface UpcomingDeadline {
  userId: string;
  name: string;
  department: string;
  progressPct: number;
  dueAt: string;
  daysLeft: number;
}

export interface DashboardMetrics {
  atRisk: AtRiskLearner[];
  topPerformers: TopPerformer[];
  flaggedQuestions: FlaggedQuestion[];
  easyTests: EasyTest[];
  studyEffort: StudyEffort;
  progressTrend: { day: string; active: number; completed: number }[];
  scoreTrend: { day: string; score: number }[];
  assignmentStatus: { name: string; count: number }[];
  learnersByDepartment: { department: string; learners: number }[];
  completionByDept: { name: string; value: number }[];
  recentActivity: DashboardActivityItem[];
  upcomingDeadlines: UpcomingDeadline[];
}

export async function fetchDashboardMetrics(): Promise<DashboardMetrics> {
  return fetchDashboardMetricsFn();
}
