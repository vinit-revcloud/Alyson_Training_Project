import { createClient, SupabaseAuthAdapter } from "@neondatabase/neon-js";
import type { Database } from "./types";
import { getNeonAuthUrl, getNeonDataApiUrl } from "./env";

function createNeonClient() {
  return createClient<Database>({
    auth: {
      adapter: SupabaseAuthAdapter(),
      url: getNeonAuthUrl(),
    },
    dataApi: {
      url: getNeonDataApiUrl(),
    },
  });
}

let _client: ReturnType<typeof createNeonClient> | undefined;

/** Neon Data API + Auth client (Supabase-compatible API surface). */
export const db = new Proxy({} as ReturnType<typeof createNeonClient>, {
  get(_, prop, receiver) {
    if (!_client) _client = createNeonClient();
    return Reflect.get(_client, prop, receiver);
  },
});

/** @deprecated Use `db` — kept for gradual migration */
export const supabase = db;
