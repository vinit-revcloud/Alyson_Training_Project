/** Google Workspace domain required for all sign-in methods. */
export const ALLOWED_EMAIL_DOMAIN = "cintara.ai";

export const INVITE_TOKEN_STORAGE_KEY = "alyson_invite_token";

export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.trim().toLowerCase().endsWith(`@${ALLOWED_EMAIL_DOMAIN}`);
}

export function postAuthHomePath(roles: string[] | null | undefined): string {
  if (!roles?.length) return "/auth";
  if (roles.length === 1 && roles[0] === "trainee") return "/learn";
  if (roles.length === 1 && roles[0] === "hiring_manager") return "/interviews";
  if (roles.length === 1 && roles[0] === "ceo") return "/hiring/reports";
  return "/";
}

/** Post-auth or email-confirm redirect back to `/auth` with invite context preserved. */
export function buildAuthCallbackUrl(
  origin: string,
  params?: { token?: string; email?: string; mode?: "signin" | "signup" },
): string {
  const search = new URLSearchParams();
  if (params?.mode) search.set("mode", params.mode);
  if (params?.email) search.set("email", params.email.trim().toLowerCase());
  if (params?.token) search.set("token", params.token.trim());
  const qs = search.toString();
  return `${origin.replace(/\/$/, "")}/auth${qs ? `?${qs}` : ""}`;
}

/** Default search params for `/auth` (required by route validateSearch). */
export const AUTH_SEARCH_DEFAULTS = {
  mode: "signin" as const,
  email: "",
  token: "",
};

export type AuthSearch = {
  mode: "signin" | "signup";
  email: string;
  token: string;
};
