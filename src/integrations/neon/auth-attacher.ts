import { createMiddleware } from "@tanstack/react-start";
import { db } from "./client";

export const attachDbAuth = createMiddleware({ type: "function" }).client(async ({ next }) => {
  const { data } = await db.auth.getSession();
  const token =
    data.session?.access_token ??
    (typeof db.auth.getJWTToken === "function" ? await db.auth.getJWTToken() : null);
  return next({
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
});

/** @deprecated Use attachDbAuth */
export const attachSupabaseAuth = attachDbAuth;
