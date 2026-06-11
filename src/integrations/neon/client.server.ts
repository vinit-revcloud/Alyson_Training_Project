import { createClient, SupabaseAuthAdapter } from "@neondatabase/neon-js";
import type { Database } from "./types";
import { getNeonAuthUrl, getNeonDataApiUrl } from "./env";

function createAdminClient() {
  return createClient<Database>({
    auth: {
      adapter: SupabaseAuthAdapter(),
      url: getNeonAuthUrl(),
      allowAnonymous: true,
    },
    dataApi: {
      url: getNeonDataApiUrl(),
    },
  });
}

let _admin: ReturnType<typeof createAdminClient> | undefined;

/** Server-side Neon client for cron, webhooks, and admin operations. */
export const dbAdmin = new Proxy({} as ReturnType<typeof createAdminClient>, {
  get(_, prop, receiver) {
    if (!_admin) _admin = createAdminClient();
    return Reflect.get(_admin, prop, receiver);
  },
});

/** @deprecated Use `dbAdmin` */
export const supabaseAdmin = dbAdmin;

export type DbClient = ReturnType<typeof createAdminClient>;
