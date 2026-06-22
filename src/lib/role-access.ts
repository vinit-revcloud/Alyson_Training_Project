import type { NavItem } from "@/lib/admin-data";
import { NAV_ITEMS } from "@/lib/admin-data";

export type WorkspaceRole =
  | "admin"
  | "trainer"
  | "trainee"
  | "candidate"
  | "hiring_manager"
  | "ceo";

const ADMIN_ONLY_PREFIXES = [
  "/invites",
  "/users",
  "/email-testing",
  "/settings",
  "/notifications",
];

const HIRING_MANAGER_PREFIXES = ["/interviews", "/hiring"];

const CEO_READ_PREFIXES = ["/", "/analytics", "/hiring", "/executive"];

export function hasRole(roles: string[], role: WorkspaceRole): boolean {
  return roles.includes(role);
}

export function hasWorkspaceAccess(roles: string[]): boolean {
  return roles.length > 0;
}

export function canAccessLearnRoute(roles: string[]): boolean {
  return hasWorkspaceAccess(roles);
}

/** Candidate-only users get a subset of /learn routes; trainees and staff get full /learn. */
const CANDIDATE_LEARN_PREFIXES = [
  "/learn/dashboard",
  "/learn/trial",
  "/learn/guide",
  "/learn/assignments",
  "/learn/policies",
] as const;

export function canAccessLearnSubroute(pathname: string, roles: string[]): boolean {
  if (!canAccessLearnRoute(roles)) return false;
  if (!isCandidateOnly(roles)) return true;
  if (pathname === "/learn" || pathname === "/learn/") return true;
  return CANDIDATE_LEARN_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
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

export function isCandidateOnly(roles: string[]): boolean {
  return roles.length === 1 && roles[0] === "candidate";
}

export function isLearnerOnly(roles: string[]): boolean {
  return isTraineeOnly(roles) || isCandidateOnly(roles);
}

export function isHiringManagerOnly(roles: string[]): boolean {
  return isHiringManager(roles) && !isTrainer(roles) && !isAdmin(roles);
}

export function hiringManagerHomePath(): string {
  return "/interviews";
}

export function canAccessAdminRoute(pathname: string, roles: string[]): boolean {
  if (isLearnerOnly(roles)) return pathname.startsWith("/learn");
  if (isAdmin(roles)) return true;
  if (isExecutiveReadOnly(roles)) {
    return CEO_READ_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  }
  if (isHiringManagerOnly(roles)) {
    if (pathname === "/assessments/builder") return true;
    if (/^\/assessments\/[^/]+\/preview$/.test(pathname)) return true;
    return HIRING_MANAGER_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  }
  if (isTrainer(roles) || isHiringManager(roles)) {
    return !ADMIN_ONLY_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  }
  return false;
}

export function navItemsForRoles(roles: string[]): NavItem[] {
  if (isLearnerOnly(roles)) return [];
  if (isExecutiveReadOnly(roles)) {
    return NAV_ITEMS.filter((item) =>
      ["/", "/analytics", "/hiring/reports", "/interviews", "/executive"].includes(item.to),
    );
  }
  if (isHiringManagerOnly(roles)) {
    return NAV_ITEMS.filter((item) =>
      ["/interviews", "/interviews/assessments", "/hiring/pipeline", "/hiring/reports", "/analytics"].includes(item.to),
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
    case "candidate":
      return "Candidate";
    case "hiring_manager":
      return "Hiring Manager";
    case "ceo":
      return "CEO";
  }
}
