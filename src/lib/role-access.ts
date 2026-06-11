import type { NavItem } from "@/lib/admin-data";
import { NAV_ITEMS } from "@/lib/admin-data";

export type WorkspaceRole = "admin" | "trainer" | "trainee" | "hiring_manager" | "ceo";

const ADMIN_ONLY_PREFIXES = [
  "/invites",
  "/users",
  "/email-testing",
  "/settings",
  "/notifications",
];

const HIRING_MANAGER_PREFIXES = ["/interviews", "/hiring"];

const CEO_READ_PREFIXES = ["/", "/analytics", "/hiring"];

export function hasRole(roles: string[], role: WorkspaceRole): boolean {
  return roles.includes(role);
}

export function hasWorkspaceAccess(roles: string[]): boolean {
  return roles.length > 0;
}

export function canAccessLearnRoute(roles: string[]): boolean {
  return hasWorkspaceAccess(roles);
}

export function isAdmin(roles: string[]): boolean {
  return hasRole(roles, "admin");
}

export function isTrainer(roles: string[]): boolean {
  return hasRole(roles, "trainer");
}

export function isHiringManager(roles: string[]): boolean {
  return hasRole(roles, "hiring_manager");
}

export function isCeo(roles: string[]): boolean {
  return hasRole(roles, "ceo");
}

export function isExecutiveReadOnly(roles: string[]): boolean {
  return isCeo(roles) && !isAdmin(roles) && !isTrainer(roles) && !isHiringManager(roles);
}

export function isTraineeOnly(roles: string[]): boolean {
  return roles.length === 1 && roles[0] === "trainee";
}

export function canAccessAdminRoute(pathname: string, roles: string[]): boolean {
  if (isTraineeOnly(roles)) return pathname.startsWith("/learn");
  if (isAdmin(roles)) return true;
  if (isExecutiveReadOnly(roles)) {
    return CEO_READ_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  }
  if (isHiringManager(roles) && !isTrainer(roles)) {
    return HIRING_MANAGER_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  }
  if (isTrainer(roles) || isHiringManager(roles)) {
    return !ADMIN_ONLY_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  }
  return false;
}

export function navItemsForRoles(roles: string[]): NavItem[] {
  if (isTraineeOnly(roles)) return [];
  if (isExecutiveReadOnly(roles)) {
    return NAV_ITEMS.filter((item) =>
      ["/", "/analytics", "/hiring/reports", "/interviews"].includes(item.to),
    );
  }
  if (isHiringManager(roles) && !isTrainer(roles) && !isAdmin(roles)) {
    return NAV_ITEMS.filter((item) =>
      ["/interviews", "/hiring/reports", "/analytics"].includes(item.to),
    );
  }
  if (isAdmin(roles)) return NAV_ITEMS;
  if (isTrainer(roles) || isHiringManager(roles)) {
    return NAV_ITEMS.filter(
      (item) => !ADMIN_ONLY_PREFIXES.some((p) => item.to === p || item.to.startsWith(`${p}/`)),
    );
  }
  return [];
}

export function roleLabel(role: WorkspaceRole): string {
  switch (role) {
    case "admin":
      return "Admin";
    case "trainer":
      return "Creator";
    case "trainee":
      return "Student";
    case "hiring_manager":
      return "Hiring Manager";
    case "ceo":
      return "CEO";
  }
}
