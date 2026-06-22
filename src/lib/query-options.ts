/** Shared React Query defaults — tuned for Neon free tier (avoid aggressive polling). */
export const DASHBOARD_QUERY_OPTS = {
  staleTime: 120_000,
  refetchInterval: 300_000,
  refetchOnWindowFocus: false,
} as const;

export const ANALYTICS_QUERY_OPTS = DASHBOARD_QUERY_OPTS;

export const NOTIFICATIONS_QUERY_OPTS = {
  staleTime: 120_000,
  refetchInterval: 300_000,
  refetchOnWindowFocus: false,
} as const;

/** Live interview session list — poll only when tab is visible. */
export const INTERVIEW_LIST_POLL_MS = 30_000;

/** Proctor session detail while candidate is live */
export const INTERVIEW_SESSION_LIVE_POLL_MS = 10_000;

/** Session detail while AI evaluation is running */
export const INTERVIEW_SESSION_EVAL_POLL_MS = 15_000;

/** Candidate waiting room / in-progress token page */
export const INTERVIEW_CANDIDATE_POLL_MS = 5_000;

export const INTERVIEW_POLL_OPTS = {
  refetchOnWindowFocus: false,
  refetchIntervalInBackground: false,
} as const;
