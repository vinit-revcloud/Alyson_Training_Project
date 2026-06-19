/** Browser origins for CSRF validation (safe to import from start.ts). */
export function getTrustedPublicOrigins(): string[] {
  const origins = new Set<string>();

  const add = (raw: string | undefined) => {
    if (!raw?.trim()) return;
    try {
      const normalized = raw.trim().replace(/\/$/, "");
      const withProtocol = normalized.startsWith("http") ? normalized : `https://${normalized}`;
      origins.add(new URL(withProtocol).origin);
    } catch {
      /* ignore invalid */
    }
  };

  if (typeof process !== "undefined") {
    add(process.env.APP_BASE_URL);
    add(process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);
    add(process.env.VERCEL_BRANCH_URL ? `https://${process.env.VERCEL_BRANCH_URL}` : undefined);
    add(process.env.VERCEL_PROJECT_PRODUCTION_URL);
    if (process.env.NODE_ENV !== "production") {
      add("http://localhost:5173");
      add("http://localhost:4173");
    }
  }

  return [...origins];
}
