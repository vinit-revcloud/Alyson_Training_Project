import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireDbAuth } from "@/integrations/neon/auth-middleware";
import { requireAdminUserId } from "@/lib/auth-token.server";
import { workspaceRoleSchema } from "@/lib/workspace-roles.shared";
import {
  listWorkspaceUsersFromDb,
  setUserRolesInDb,
  setUsersRoleInDb,
  setUserStatusInDb,
  setUsersStatusInDb,
} from "@/lib/user-management.server";

export const listWorkspaceUsersFn = createServerFn({ method: "GET" })
  .middleware([requireDbAuth])
  .handler(async () => {
    await requireAdminUserId();
    return listWorkspaceUsersFromDb();
  });

export const setUserRolesFn = createServerFn({ method: "POST" })
  .middleware([requireDbAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        roles: z.array(workspaceRoleSchema).min(1),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await requireAdminUserId();
    const roles = await setUserRolesInDb(data.userId, data.roles, context.userId);
    return { roles };
  });

export const setUsersRoleFn = createServerFn({ method: "POST" })
  .middleware([requireDbAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        userIds: z.array(z.string().uuid()).min(1),
        role: workspaceRoleSchema,
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await requireAdminUserId();
    const updated = await setUsersRoleInDb(data.userIds, data.role, context.userId);
    return { updated };
  });

export const setUserStatusFn = createServerFn({ method: "POST" })
  .middleware([requireDbAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        status: z.enum(["active", "suspended"]),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await requireAdminUserId();
    await setUserStatusInDb(data.userId, data.status, context.userId);
    return { ok: true };
  });

export const setUsersStatusFn = createServerFn({ method: "POST" })
  .middleware([requireDbAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        userIds: z.array(z.string().uuid()).min(1),
        status: z.enum(["active", "suspended"]),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await requireAdminUserId();
    const updated = await setUsersStatusInDb(data.userIds, data.status, context.userId);
    return { updated };
  });
