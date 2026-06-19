import { createMiddleware } from "@tanstack/react-start";
import { db } from "./client";

async function resolveAuthToken(): Promise<string | null> {
  if (typeof db.auth.getJWTToken === "function") {
    try {
      const jwt = await db.auth.getJWTToken();
      if (jwt?.trim()) return jwt.trim();
    } catch {
      /* fall through to session */
    }
  }

  const { data, error } = await db.auth.getSession();
  if (error) return null;
  const token = data.session?.access_token?.trim();
  return token || null;
}

export const attachDbAuth = createMiddleware({ type: "function" }).client(async ({ next }) => {
  const token = await resolveAuthToken();
  return next({
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
});

/** @deprecated Use attachDbAuth */
export const attachSupabaseAuth = attachDbAuth;
