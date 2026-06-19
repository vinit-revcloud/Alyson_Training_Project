import { getPgPool } from "@/lib/pg.server";

export class AccountSuspendedError extends Error {
  constructor() {
    super("Forbidden: account is suspended");
    this.name = "AccountSuspendedError";
  }
}

const CACHE_TTL_MS = 60_000;
const statusCache = new Map<string, { status: string; expiresAt: number }>();

/** Reject suspended/inactive profiles on authenticated requests. */
export async function assertActiveUser(userId: string): Promise<void> {
  const now = Date.now();
  const cached = statusCache.get(userId);
  if (cached && cached.expiresAt > now) {
    if (cached.status !== "active") throw new AccountSuspendedError();
    return;
  }

  const pool = getPgPool();
  const { rows } = await pool.query<{ status: string }>(
    `SELECT status FROM profiles WHERE user_id = $1 LIMIT 1`,
    [userId],
  );
  const status = rows[0]?.status ?? "active";
  statusCache.set(userId, { status, expiresAt: now + CACHE_TTL_MS });
  if (status !== "active") throw new AccountSuspendedError();
}

export function clearProfileStatusCache(userId?: string): void {
  if (userId) statusCache.delete(userId);
  else statusCache.clear();
}
