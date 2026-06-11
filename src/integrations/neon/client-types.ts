import type { db } from "./client";
import type { dbAdmin } from "./client.server";

/** App database client (Neon Data API + Supabase-compatible auth adapter). */
export type DbClient = typeof db;

/** Server admin client. */
export type DbAdminClient = typeof dbAdmin;

/** Minimal session shape from Neon SupabaseAuthAdapter. */
export interface AppSession {
  access_token: string;
  refresh_token?: string;
  user: {
    id: string;
    email?: string | null;
    user_metadata?: Record<string, unknown>;
  };
}

export type Session = AppSession | null;
