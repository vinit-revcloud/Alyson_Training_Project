import {
  createInviteFn,
  listInvitesFn,
  previewInviteFn,
  resendInviteFn,
  revokeInviteFn,
  revokeInvitesFn,
  updateInviteRoleFn,
  updateInvitesRoleFn,
} from "@/lib/invites.functions";
import type { InviteRole, InviteRow } from "@/lib/invites.shared";

export type { InviteRole, InviteRow };
export {
  INVITE_EXPIRY_DAYS,
  INVITE_ROLE_OPTIONS,
  getInviteStatus,
  inviteExpiresAt,
  inviteRoleLabel,
  isInviteExpired,
  inviteLink,
} from "@/lib/invites.shared";
export type { InviteStatus } from "@/lib/invites.shared";

export async function listInvites(): Promise<InviteRow[]> {
  return listInvitesFn({ data: {} });
}

export async function createInvite(input: {
  email: string;
  role: InviteRole;
  department?: string | null;
}): Promise<{
  invite: InviteRow;
  link: string;
  emailSent?: boolean;
  emailProcessed?: number;
}> {
  return createInviteFn({ data: input });
}

export async function revokeInvite(id: string): Promise<void> {
  await revokeInviteFn({ data: { id } });
}

export async function revokeInvites(ids: string[]): Promise<void> {
  await revokeInvitesFn({ data: { ids } });
}

export async function updateInviteRole(id: string, role: InviteRole): Promise<void> {
  await updateInviteRoleFn({ data: { id, role } });
}

export async function updateInvitesRole(ids: string[], role: InviteRole): Promise<void> {
  await updateInvitesRoleFn({ data: { ids, role } });
}

export async function touchInvite(id: string): Promise<{
  invite: InviteRow;
  link: string;
  emailSent?: boolean;
  emailProcessed?: number;
}> {
  return resendInviteFn({ data: { id } });
}

export async function previewInvite(token: string, email?: string) {
  return previewInviteFn({ data: { token, email } });
}
