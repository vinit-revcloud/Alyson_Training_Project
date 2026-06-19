import {
  listWorkspaceUsersFn,
  setUserRolesFn,
  setUsersRoleFn,
  setUserStatusFn,
  setUsersStatusFn,
} from "@/lib/user-management.functions";
import type { WorkspaceUserRow } from "@/lib/user-management.server";
import type { WorkspaceRole } from "@/lib/workspace-roles.shared";

export type { WorkspaceUserRow };

export async function listWorkspaceUsers(): Promise<WorkspaceUserRow[]> {
  return listWorkspaceUsersFn();
}

export async function setUserRoles(userId: string, roles: WorkspaceRole[]): Promise<string[]> {
  const result = await setUserRolesFn({ data: { userId, roles } });
  return result.roles;
}

export async function setUsersRole(userIds: string[], role: WorkspaceRole): Promise<number> {
  const result = await setUsersRoleFn({ data: { userIds, role } });
  return result.updated;
}

export async function setUserStatus(
  userId: string,
  status: "active" | "suspended",
): Promise<void> {
  await setUserStatusFn({ data: { userId, status } });
}

export async function setUsersStatus(
  userIds: string[],
  status: "active" | "suspended",
): Promise<number> {
  const result = await setUsersStatusFn({ data: { userIds, status } });
  return result.updated;
}
