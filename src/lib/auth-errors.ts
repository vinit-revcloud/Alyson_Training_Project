/** Detect auth failures from server functions and API errors. */
export function isAuthError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  const lower = message.toLowerCase();
  return (
    lower.includes("unauthorized") ||
    lower.includes("invalid token") ||
    lower.includes("no bearer token") ||
    lower.includes("not authenticated")
  );
}
