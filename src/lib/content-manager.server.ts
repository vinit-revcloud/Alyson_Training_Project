import { getPgPool } from "@/lib/pg.server";

export type ContentRole = "admin" | "trainer" | "hiring_manager";

/** True when user has admin, trainer, or hiring_manager role. */
export async function userHasContentManagerRole(userId: string): Promise<boolean> {
  const pool = getPgPool();
  const { rows } = await pool.query<{ role: string }>(
    `SELECT role::text AS role FROM user_roles
     WHERE user_id = $1 AND role IN ('admin', 'trainer', 'hiring_manager')`,
    [userId],
  );
  return rows.length > 0;
}

export async function assertContentManager(userId: string): Promise<void> {
  const ok = await userHasContentManagerRole(userId);
  if (!ok) {
    throw new Error("Not authorized — trainer or admin role required to create courses");
  }
}
