/** Structured server error logging (wire to Sentry when SENTRY_DSN is set). */
export function captureServerException(
  err: unknown,
  context?: Record<string, unknown>,
): void {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  const payload = {
    level: "error",
    message,
    stack,
    ...context,
    ts: new Date().toISOString(),
  };
  console.error(JSON.stringify(payload));
  const dsn = process.env.SENTRY_DSN?.trim();
  if (dsn) {
    // Optional: forward to Sentry ingest when DSN configured in Vercel
    void fetch(`https://o0.ingest.sentry.io/api/0/envelope/`, {
      method: "POST",
      body: JSON.stringify(payload),
    }).catch(() => undefined);
  }
}
