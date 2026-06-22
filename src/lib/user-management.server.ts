import { getPgPool } from "@/lib/pg.server";
import type { WorkspaceRole } from "@/lib/workspace-roles.shared";

export interface WorkspaceUserRow {
  user_id: string;
  display_name: string | null;
  email: string | null;
  department: string | null;
  status: string;
  roles: string[];
  assigned_courses: number;
  pipeline_stage: string | null;
}

export async function listWorkspaceUsersFromDb(): Promise<WorkspaceUserRow[]> {
  const pool = getPgPool();
  const { rows } = await pool.query<{
    user_id: string;
    display_name: string | null;
    email: string | null;
    department: string | null;
    status: string;
    roles: string[];
    assigned_courses: number;
    pipeline_stage: string | null;
  }>(
    `WITH courses_by_dept AS (
       SELECT cd.department, COUNT(DISTINCT cd.course_id)::int AS n
       FROM course_departments cd
       GROUP BY cd.department
     )
     SELECT p.user_id, p.display_name, p.email, p.department, p.status,
            COALESCE(array_agg(DISTINCT ur.role::text) FILTER (WHERE ur.role IS NOT NULL), '{}') AS roles,
            COALESCE(MAX(cbd.n), 0)::int AS assigned_courses,
            (
              SELECT hp.current_stage FROM hiring_pipelines hp
              WHERE hp.user_id = p.user_id
              ORDER BY hp.updated_at DESC LIMIT 1
            ) AS pipeline_stage
     FROM profiles p
     LEFT JOIN user_roles ur ON ur.user_id = p.user_id
     LEFT JOIN courses_by_dept cbd ON cbd.department = p.department
     GROUP BY p.user_id, p.display_name, p.email, p.department, p.status
     ORDER BY p.display_name NULLS LAST, p.email`,
  );

  return rows.map((r) => ({
    user_id: r.user_id,
    display_name: r.display_name,
    email: r.email,
    department: r.department,
    status: r.status ?? "active",
    roles: r.roles ?? [],
    assigned_courses: r.assigned_courses ?? 0,
    pipeline_stage: r.pipeline_stage,
  }));
}

async function countAdminsExcluding(
  client: import("pg").PoolClient,
  excludeUserId?: string,
): Promise<number> {
  const { rows } = await client.query<{ n: number }>(
    `SELECT count(DISTINCT user_id)::int AS n
     FROM user_roles
     WHERE role = 'admin'
       AND ($1::uuid IS NULL OR user_id <> $1)`,
    [excludeUserId ?? null],
  );
  return rows[0]?.n ?? 0;
}

export async function setUserRolesInDb(
  targetUserId: string,
  roles: WorkspaceRole[],
  actorUserId: string,
): Promise<string[]> {
  const unique = [...new Set(roles)];
  if (!unique.length) {
    throw new Error("At least one role is required");
  }

  const pool = getPgPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const profile = await client.query<{ email: string | null }>(
      `SELECT email FROM profiles WHERE user_id = $1 LIMIT 1`,
      [targetUserId],
    );
    if (!profile.rows[0]) throw new Error("User profile not found");

    const current = await client.query<{ role: WorkspaceRole }>(
      `SELECT role FROM user_roles WHERE user_id = $1`,
      [targetUserId],
    );
    const hadAdmin = current.rows.some((r) => r.role === "admin");
    const willHaveAdmin = unique.includes("admin");

    if (hadAdmin && !willHaveAdmin) {
      const remaining = await countAdminsExcluding(client, targetUserId);
      if (remaining === 0) {
        throw new Error("Cannot remove the last admin from the workspace");
      }
    }

    if (targetUserId === actorUserId && hadAdmin && !willHaveAdmin) {
      throw new Error("You cannot remove your own admin role");
    }

    await client.query(`DELETE FROM user_roles WHERE user_id = $1`, [targetUserId]);
    for (const role of unique) {
      await client.query(
        `INSERT INTO user_roles (user_id, role) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [targetUserId, role],
      );
    }

    await client.query("COMMIT");
    return unique;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function setUsersRoleInDb(
  userIds: string[],
  role: WorkspaceRole,
  actorUserId: string,
): Promise<number> {
  let updated = 0;
  for (const userId of userIds) {
    await setUserRolesInDb(userId, [role], actorUserId);
    updated += 1;
  }
  return updated;
}

export async function setUserStatusInDb(
  targetUserId: string,
  status: "active" | "suspended",
  actorUserId: string,
): Promise<void> {
  if (targetUserId === actorUserId && status === "suspended") {
    throw new Error("You cannot suspend your own account");
  }

  if (status === "suspended") {
    const pool = getPgPool();
    const { rows } = await pool.query<{ role: string }>(
      `SELECT role FROM user_roles WHERE user_id = $1`,
      [targetUserId],
    );
    const isAdmin = rows.some((r) => r.role === "admin");
    if (isAdmin) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const remaining = await countAdminsExcluding(client, targetUserId);
        await client.query("ROLLBACK");
        if (remaining === 0) {
          throw new Error("Cannot suspend the last admin account");
        }
      } finally {
        client.release();
      }
    }
  }

  const pool = getPgPool();
  const { rowCount } = await pool.query(
    `UPDATE profiles SET status = $2, updated_at = now() WHERE user_id = $1`,
    [targetUserId, status],
  );
  if (!rowCount) throw new Error("User profile not found");
}

export async function setUsersStatusInDb(
  userIds: string[],
  status: "active" | "suspended",
  actorUserId: string,
): Promise<number> {
  let updated = 0;
  for (const userId of userIds) {
    await setUserStatusInDb(userId, status, actorUserId);
    updated += 1;
  }
  return updated;
}
