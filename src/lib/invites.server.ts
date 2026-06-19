import type { PoolClient } from "pg";
import { getPgPool } from "@/lib/pg.server";
import type { InviteRole } from "@/lib/invites.shared";

export type { InviteRole };

export const INVITE_EXPIRY_DAYS = 14;

export interface InviteRow {
  id: string;
  email: string;
  role: InviteRole;
  department: string | null;
  token: string;
  invited_by: string | null;
  accepted_at: string | null;
  accepted_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvitePreview {
  valid: boolean;
  reason?: "not_found" | "accepted" | "expired" | "wrong_email";
  email?: string;
  role?: InviteRole;
  department?: string | null;
  expiresAt?: string;
}

export function inviteExpiresAt(createdAt: string | Date): Date {
  const base = typeof createdAt === "string" ? new Date(createdAt) : createdAt;
  return new Date(base.getTime() + INVITE_EXPIRY_DAYS * 86_400_000);
}

export function isInviteExpired(inv: Pick<InviteRow, "created_at" | "accepted_at">): boolean {
  if (inv.accepted_at) return false;
  return Date.now() > inviteExpiresAt(inv.created_at).getTime();
}

export function buildInviteUrl(origin: string, invite: Pick<InviteRow, "email" | "token">): string {
  const params = new URLSearchParams({
    email: invite.email,
    mode: "signup",
    token: invite.token,
  });
  return `${origin.replace(/\/$/, "")}/auth?${params.toString()}`;
}

/** Users who joined before accept tracking was fixed — mark matching invites accepted. */
export async function syncStaleInviteAcceptances(): Promise<number> {
  const pool = getPgPool();
  const { rowCount } = await pool.query(
    `UPDATE invites i
     SET accepted_at = now(),
         accepted_by = p.user_id,
         updated_at = now()
     FROM profiles p
     WHERE lower(i.email) = lower(p.email)
       AND i.accepted_at IS NULL
       AND EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = p.user_id)`,
  );
  return rowCount ?? 0;
}

export async function markInviteAcceptedForJoinedUser(
  client: PoolClient,
  input: { userId: string; email: string },
): Promise<boolean> {
  const { rows } = await client.query<{ id: string }>(
    `UPDATE invites
     SET accepted_at = COALESCE(accepted_at, now()),
         accepted_by = COALESCE(accepted_by, $1),
         updated_at = now()
     WHERE lower(email) = lower($2)
       AND accepted_at IS NULL
     RETURNING id`,
    [input.userId, input.email],
  );
  return rows.length > 0;
}

export async function listInvites(): Promise<InviteRow[]> {
  await syncStaleInviteAcceptances();
  const pool = getPgPool();
  const { rows } = await pool.query<InviteRow>(
    `SELECT * FROM invites ORDER BY created_at DESC`,
  );
  return rows;
}

export async function getInviteByToken(token: string): Promise<InviteRow | null> {
  const pool = getPgPool();
  const { rows } = await pool.query<InviteRow>(
    `SELECT * FROM invites WHERE token = $1 LIMIT 1`,
    [token],
  );
  return rows[0] ?? null;
}

export async function previewInviteToken(
  token: string,
  emailHint?: string,
): Promise<InvitePreview> {
  const inv = await getInviteByToken(token);
  if (!inv) return { valid: false, reason: "not_found" };
  if (inv.accepted_at) return { valid: false, reason: "accepted" };
  if (isInviteExpired(inv)) return { valid: false, reason: "expired" };
  if (emailHint && emailHint.toLowerCase() !== inv.email.toLowerCase()) {
    return { valid: false, reason: "wrong_email", email: inv.email };
  }
  return {
    valid: true,
    email: inv.email,
    role: inv.role,
    department: inv.department,
    expiresAt: inviteExpiresAt(inv.created_at).toISOString(),
  };
}

export async function createInviteRecord(input: {
  email: string;
  role: InviteRole;
  department?: string | null;
  invitedBy: string;
}): Promise<InviteRow> {
  const pool = getPgPool();
  const email = input.email.trim().toLowerCase();

  const existing = await pool.query<InviteRow>(
    `SELECT * FROM invites WHERE lower(email) = $1 LIMIT 1`,
    [email],
  );
  const row = existing.rows[0];

  if (row?.accepted_at) {
    throw new Error("This person already accepted an invite and has workspace access.");
  }

  if (row) {
    const { rows } = await pool.query<InviteRow>(
      `UPDATE invites
       SET role = $2,
           department = $3,
           invited_by = $4,
           token = encode(gen_random_bytes(16), 'hex'),
           created_at = now(),
           updated_at = now(),
           accepted_at = NULL,
           accepted_by = NULL
       WHERE id = $1
       RETURNING *`,
      [row.id, input.role, input.department ?? null, input.invitedBy],
    );
    return rows[0];
  }

  const { rows } = await pool.query<InviteRow>(
    `INSERT INTO invites (email, role, department, invited_by)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [email, input.role, input.department ?? null, input.invitedBy],
  );
  return rows[0];
}

export async function revokeInviteById(id: string): Promise<void> {
  const pool = getPgPool();
  await pool.query(`DELETE FROM invites WHERE id = $1`, [id]);
}

export async function revokeInvitesByIds(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const pool = getPgPool();
  await pool.query(`DELETE FROM invites WHERE id = ANY($1::uuid[])`, [ids]);
}

export async function updateInviteRoleById(id: string, role: InviteRole): Promise<void> {
  const pool = getPgPool();
  await pool.query(
    `UPDATE invites SET role = $2, updated_at = now() WHERE id = $1 AND accepted_at IS NULL`,
    [id, role],
  );
}

export async function updateInvitesRoleByIds(ids: string[], role: InviteRole): Promise<void> {
  if (!ids.length) return;
  const pool = getPgPool();
  await pool.query(
    `UPDATE invites SET role = $2, updated_at = now()
     WHERE id = ANY($1::uuid[]) AND accepted_at IS NULL`,
    [ids, role],
  );
}

export async function refreshInvite(id: string): Promise<InviteRow> {
  const pool = getPgPool();
  const { rows } = await pool.query<InviteRow>(
    `UPDATE invites
     SET created_at = now(),
         updated_at = now(),
         token = encode(gen_random_bytes(16), 'hex')
     WHERE id = $1 AND accepted_at IS NULL
     RETURNING *`,
    [id],
  );
  if (!rows[0]) throw new Error("Invite not found or already accepted");
  return rows[0];
}

/** Apply a pending invite during sign-in bootstrap. Returns null if none/expired. */
export async function consumeInviteForUser(
  client: PoolClient,
  input: { userId: string; email: string; inviteToken?: string },
): Promise<{ role: InviteRole; department: string | null } | null> {
  const { userId, email, inviteToken } = input;
  let invite: { id: string; role: InviteRole; department: string | null } | null = null;

  if (inviteToken) {
    const byToken = await client.query<InviteRow>(
      `SELECT * FROM invites WHERE token = $1 LIMIT 1`,
      [inviteToken],
    );
    const row = byToken.rows[0];
    if (
      row &&
      !row.accepted_at &&
      row.email.toLowerCase() === email.toLowerCase() &&
      !isInviteExpired(row)
    ) {
      invite = { id: row.id, role: row.role, department: row.department };
    }
  }

  if (!invite) {
    const byEmail = await client.query<InviteRow>(
      `SELECT * FROM invites
       WHERE lower(email) = $1 AND accepted_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [email.toLowerCase()],
    );
    const row = byEmail.rows[0];
    if (row && !isInviteExpired(row)) {
      invite = { id: row.id, role: row.role, department: row.department };
    }
  }

  if (!invite) return null;

  await client.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, $2)`, [
    userId,
    invite.role,
  ]);

  if (invite.department) {
    await client.query(`UPDATE profiles SET department = $2 WHERE user_id = $1`, [
      userId,
      invite.department,
    ]);
  }

  await client.query(
    `UPDATE invites SET accepted_at = now(), accepted_by = $1, updated_at = now() WHERE id = $2`,
    [userId, invite.id],
  );

  return { role: invite.role, department: invite.department };
}
