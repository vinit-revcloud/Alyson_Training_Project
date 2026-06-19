import {
  WORKSPACE_ROLE_OPTIONS,
  workspaceRoleLabel,
  type WorkspaceRole,
} from "@/lib/workspace-roles.shared";

export type InviteRole = WorkspaceRole;

export const INVITE_ROLE_OPTIONS = WORKSPACE_ROLE_OPTIONS;

export function inviteRoleLabel(role: InviteRole): string {
  return workspaceRoleLabel(role);
}
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

export const INVITE_EXPIRY_DAYS = 14;

export function inviteExpiresAt(createdAt: string | Date): Date {
  const base = typeof createdAt === "string" ? new Date(createdAt) : createdAt;
  return new Date(base.getTime() + INVITE_EXPIRY_DAYS * 86_400_000);
}

export type InviteStatus = "Pending" | "Accepted" | "Expired";

export function isInviteExpired(inv: Pick<InviteRow, "created_at" | "accepted_at">): boolean {
  if (inv.accepted_at) return false;
  return Date.now() > inviteExpiresAt(inv.created_at).getTime();
}

export function getInviteStatus(inv: Pick<InviteRow, "created_at" | "accepted_at">): InviteStatus {
  if (inv.accepted_at) return "Accepted";
  if (isInviteExpired(inv)) return "Expired";
  return "Pending";
}

export function buildInviteUrl(origin: string, invite: Pick<InviteRow, "email" | "token">): string {
  const params = new URLSearchParams({
    email: invite.email,
    mode: "signup",
    token: invite.token,
  });
  return `${origin.replace(/\/$/, "")}/auth?${params.toString()}`;
}

export function inviteLink(invite: Pick<InviteRow, "email" | "token">): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return buildInviteUrl(origin, invite);
}
