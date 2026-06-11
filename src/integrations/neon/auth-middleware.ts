import { createMiddleware } from "@tanstack/react-start";
import { createClient, SupabaseAuthAdapter } from "@neondatabase/neon-js";
import type { Database } from "./types";
import { userFromRequest } from "@/lib/auth-token.server";
import { assertContentManager } from "@/lib/content-manager.server";
import { getNeonAuthUrl, getNeonDataApiUrl } from "./env";

export const requireDbAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const authUser = await userFromRequest();

    const request = await import("@tanstack/react-start/server").then((m) => m.getRequest());
    const token =
      request?.headers?.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";

    const supabase = createClient<Database>({
      auth: {
        adapter: SupabaseAuthAdapter(),
        url: getNeonAuthUrl(),
      },
      dataApi: {
        url: getNeonDataApiUrl(),
        options: {
          global: {
            headers: { Authorization: `Bearer ${token}` },
          },
        },
      },
    });

    return next({
      context: {
        supabase,
        db: supabase,
        userId: authUser.id,
        user: {
          id: authUser.id,
          email: authUser.email,
        },
      },
    });
  },
);

/** @deprecated Use requireDbAuth */
export const requireSupabaseAuth = requireDbAuth;

/** Requires authenticated trainer or admin (course creation, AI syllabus, assets). */
export const requireContentManager = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const authUser = await userFromRequest();
    await assertContentManager(authUser.id);

    const request = await import("@tanstack/react-start/server").then((m) => m.getRequest());
    const token =
      request?.headers?.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";

    const supabase = createClient<Database>({
      auth: {
        adapter: SupabaseAuthAdapter(),
        url: getNeonAuthUrl(),
      },
      dataApi: {
        url: getNeonDataApiUrl(),
        options: {
          global: {
            headers: { Authorization: `Bearer ${token}` },
          },
        },
      },
    });

    return next({
      context: {
        supabase,
        db: supabase,
        userId: authUser.id,
        user: {
          id: authUser.id,
          email: authUser.email,
        },
      },
    });
  },
);
