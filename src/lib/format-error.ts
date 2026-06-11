/** Extract a user-facing message from thrown values (Error, Postgrest, RPC payloads). */
export function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string" && error.trim()) return error.trim();
  if (error && typeof error === "object") {
    const o = error as Record<string, unknown>;
    if (typeof o.message === "string" && o.message.trim()) return o.message.trim();
    if (typeof o.error === "string" && o.error.trim()) return o.error.trim();
    if (typeof o.details === "string" && o.details.trim()) return o.details.trim();
    if (typeof o.hint === "string" && o.hint.trim()) {
      const msg = typeof o.message === "string" ? o.message : "Request failed";
      return `${msg}: ${o.hint}`;
    }
  }
  return "Unknown error";
}

export function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(formatErrorMessage(error));
}
