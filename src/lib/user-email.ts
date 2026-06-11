import type { DbClient } from "@/integrations/neon/client.server";

/** Resolve recipient email from profiles (Neon Auth user id). */
export async function getUserEmail(db: DbClient, userId: string): Promise<string | null> {
  const { data } = await db
    .from("profiles")
    .select("email")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.email ?? null;
}
