import { consumeInviteForUser, markInviteAcceptedForJoinedUser } from "@/lib/invites.server";
import { getBootstrapAdminEmails } from "@/lib/config.server";
import { getPgPool } from "@/lib/pg.server";

export type AppRole = "admin" | "trainer" | "trainee" | "hiring_manager" | "ceo";

export class AccountSuspendedError extends Error {
  constructor() {
    super("Forbidden: account is suspended");
    this.name = "AccountSuspendedError";
  }
}

async function assertActiveProfile(
  client: import("pg").PoolClient,
  userId: string,
): Promise<void> {
  const { rows } = await client.query<{ status: string }>(
    `SELECT status FROM profiles WHERE user_id = $1 LIMIT 1`,
    [userId],
  );
  const status = rows[0]?.status ?? "active";
  if (status !== "active") {
    throw new AccountSuspendedError();
  }
}

export async function bootstrapUserAccount(input: {
  userId: string;
  email: string;
  displayName: string;
  inviteToken?: string;
}): Promise<AppRole[]> {
  const pool = getPgPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const roles = await bootstrapUserAccountTx(client, input);
    await client.query("COMMIT");
    return roles;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function bootstrapUserAccountTx(
  client: import("pg").PoolClient,
  input: { userId: string; email: string; displayName: string; inviteToken?: string },
): Promise<AppRole[]> {
  const { userId, email, displayName, inviteToken } = input;

  await client.query(
    `INSERT INTO profiles (user_id, email, display_name, status)
     VALUES ($1, $2, $3, 'active')
     ON CONFLICT (user_id) DO UPDATE
       SET email = EXCLUDED.email,
           display_name = COALESCE(NULLIF(EXCLUDED.display_name, ''), profiles.display_name),
           updated_at = now()`,
    [userId, email, displayName],
  );

  await assertActiveProfile(client, userId);

  const existing = await client.query<{ role: AppRole }>(
    `SELECT role FROM user_roles WHERE user_id = $1`,
    [userId],
  );
  if (existing.rows.length > 0) {
    await markInviteAcceptedForJoinedUser(client, { userId, email });
    return existing.rows.map((r) => r.role);
  }

  // Invite-only onboarding: roles are granted from a valid pending invite.
  const consumed = await consumeInviteForUser(client, { userId, email, inviteToken });

  if (!consumed) {
    const bootstrapEmails = getBootstrapAdminEmails();
    if (bootstrapEmails.includes(email.toLowerCase())) {
      await client.query(
        `INSERT INTO user_roles (user_id, role) VALUES ($1, 'admin'), ($1, 'trainer')
         ON CONFLICT (user_id, role) DO NOTHING`,
        [userId],
      );
      await markInviteAcceptedForJoinedUser(client, { userId, email });
    }
  }

  const final = await client.query<{ role: AppRole }>(
    `SELECT role FROM user_roles WHERE user_id = $1`,
    [userId],
  );
  return final.rows.map((r) => r.role);
}

export async function getUserRoles(userId: string): Promise<AppRole[]> {
  const pool = getPgPool();
  const result = await pool.query<{ role: AppRole }>(
    `SELECT role FROM user_roles WHERE user_id = $1`,
    [userId],
  );
  return result.rows.map((r) => r.role);
}
