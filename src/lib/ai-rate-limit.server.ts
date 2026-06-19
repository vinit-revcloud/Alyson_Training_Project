const WINDOW_MS = 60_000;
const MAX_CALLS_PER_WINDOW = 20;

const buckets = new Map<string, { count: number; resetAt: number }>();

export class AiRateLimitError extends Error {
  constructor() {
    super("AI rate limit reached — try again in a minute");
    this.name = "AiRateLimitError";
  }
}

/** Per-user in-memory token bucket for LLM calls (suitable for ~1k users on serverless). */
export function assertAiRateLimit(userId: string): void {
  const now = Date.now();
  const entry = buckets.get(userId);
  if (!entry || entry.resetAt <= now) {
    buckets.set(userId, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  if (entry.count >= MAX_CALLS_PER_WINDOW) throw new AiRateLimitError();
  entry.count += 1;
}
