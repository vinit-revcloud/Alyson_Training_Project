import { consumeInviteForUser, getInviteByToken, markInviteAcceptedForJoinedUser } from "@/lib/invites.server";
import { getBootstrapAdminEmails } from "@/lib/config.server";
import { getPgPool } from "@/lib/pg.server";

export type AppRole = "admin" | "trainer" | "trainee" | "candidate" | "hiring_manager" | "ceo";

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

interface PipelineLinkInput {
  userId: string;
  email: string;
  pipelineId: string | null;
  department: string | null;
}

export async function bootstrapUserAccount(input: {
  userId: string;
  email: string;
  displayName: string;
  inviteToken?: string;
}): Promise<AppRole[]> {
  const pool = getPgPool();
  const client = await pool.connect();
  let pipelineLink: PipelineLinkInput | null = null;
  try {
    await client.query("BEGIN");
    const result = await bootstrapUserAccountTx(client, input);
    pipelineLink = result.pipelineLink;
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  if (pipelineLink) {
    const linkClient = await pool.connect();
    try {
      const { linkPipelineOnBootstrap } = await import(
        "@/lib/hiring-pipeline/hiring-pipeline.server"
      );
      await linkPipelineOnBootstrap(linkClient, pipelineLink);
    } catch (err) {
      console.error("[bootstrap] pipeline link failed (roles already saved):", err);
    } finally {
      linkClient.release();
    }
  }

  return getUserRoles(input.userId);
}

async function bootstrapUserAccountTx(
  client: import("pg").PoolClient,
  input: { userId: string; email: string; displayName: string; inviteToken?: string },
): Promise<{ roles: AppRole[]; pipelineLink: PipelineLinkInput | null }> {
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
    const pipelineLink = await resolvePipelineLinkInput(client, {
      userId,
      email,
      inviteToken,
      roles: existing.rows.map((r) => r.role),
    });
    return { roles: existing.rows.map((r) => r.role), pipelineLink };
  }

  let consumed = await consumeInviteForUser(client, { userId, email, inviteToken });
  if (!consumed) {
    consumed = await consumeInviteForUser(client, { userId, email, inviteToken: undefined });
  }

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

  const pipelineLink =
    consumed && (consumed.role === "candidate" || consumed.role === "trainee")
      ? {
          userId,
          email,
          pipelineId: consumed.pipelineId,
          department: consumed.department,
        }
      : null;

  return { roles: final.rows.map((r) => r.role), pipelineLink };
}

/** Link candidate/trainee to an active pipeline when user_id is still unset (retry-safe). */
async function resolvePipelineLinkInput(
  client: import("pg").PoolClient,
  input: {
    userId: string;
    email: string;
    inviteToken?: string;
    roles: AppRole[];
  },
): Promise<PipelineLinkInput | null> {
  if (!input.roles.includes("candidate") && !input.roles.includes("trainee")) {
    return null;
  }

  const linked = await client.query<{ id: string }>(
    `SELECT id FROM hiring_pipelines WHERE user_id = $1 AND status = 'active' LIMIT 1`,
    [input.userId],
  );
  if (linked.rows.length > 0) return null;

  let pipelineId: string | null = null;
  let department: string | null = null;

  if (input.inviteToken) {
    const inv = await getInviteByToken(input.inviteToken);
    if (inv && inv.email.toLowerCase() === input.email.toLowerCase()) {
      pipelineId = inv.pipeline_id ?? null;
      department = inv.department;
    }
  }

  if (!pipelineId) {
    const res = await client.query<{ id: string; target_department: string }>(
      `SELECT hp.id, hp.target_department
       FROM hiring_pipelines hp
       JOIN candidates c ON c.id = hp.candidate_id
       WHERE lower(c.email) = lower($1)
         AND hp.status = 'active'
         AND hp.user_id IS NULL
       ORDER BY hp.created_at DESC
       LIMIT 1`,
      [input.email],
    );
    pipelineId = res.rows[0]?.id ?? null;
    department = res.rows[0]?.target_department ?? null;
  }

  if (!pipelineId) return null;

  return {
    userId: input.userId,
    email: input.email,
    pipelineId,
    department,
  };
}

export async function getUserRoles(userId: string): Promise<AppRole[]> {
  const pool = getPgPool();
  const result = await pool.query<{ role: AppRole }>(
    `SELECT role FROM user_roles WHERE user_id = $1`,
    [userId],
  );
  return result.rows.map((r) => r.role);
}
