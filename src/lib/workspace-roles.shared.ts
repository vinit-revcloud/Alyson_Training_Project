import { z } from "zod";

/** All workspace roles — single source of truth for invites and user management. */
export const WORKSPACE_ROLES = [
  "admin",
  "trainer",
  "trainee",
  "hiring_manager",
  "ceo",
] as const;

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export const workspaceRoleSchema = z.enum(WORKSPACE_ROLES);

export const WORKSPACE_ROLE_OPTIONS: { value: WorkspaceRole; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "trainer", label: "Creator (Trainer)" },
  { value: "trainee", label: "Student (Trainee)" },
  { value: "hiring_manager", label: "Hiring Manager (HR / Recruiter)" },
  { value: "ceo", label: "CEO (read-only)" },
];

export function workspaceRoleLabel(role: WorkspaceRole): string {
  return WORKSPACE_ROLE_OPTIONS.find((o) => o.value === role)?.label ?? role;
}

/** Primary role for bulk assignment — excludes trainee for staff management defaults. */
export const STAFF_ROLE_OPTIONS = WORKSPACE_ROLE_OPTIONS.filter(
  (o) => o.value !== "trainee",
);
