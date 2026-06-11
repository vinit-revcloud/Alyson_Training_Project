import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { getRequest } from "@tanstack/react-start/server";
import { ALLOWED_EMAIL_DOMAIN } from "@/lib/auth-constants";
import { getNeonAuthUrl } from "@/integrations/neon/env";

export interface AuthUser {
  id: string;
  email: string;
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function neonJwks(): ReturnType<typeof createRemoteJWKSet> {
  if (!jwks) {
    const authUrl = getNeonAuthUrl().replace(/\/$/, "");
    jwks = createRemoteJWKSet(new URL(`${authUrl}/.well-known/jwks.json`));
  }
  return jwks;
}

function emailFromClaims(claims: JWTPayload): string | null {
  const email =
    (typeof claims.email === "string" && claims.email) ||
    (typeof claims.user_email === "string" && claims.user_email) ||
    null;
  return email?.toLowerCase() ?? null;
}

/** Verify Neon Auth JWT signature, expiry, and issuer. */
export async function userFromBearerToken(token: string): Promise<AuthUser> {
  const authUrl = getNeonAuthUrl().replace(/\/$/, "");
  let claims: JWTPayload;
  try {
    const verified = await jwtVerify(token, neonJwks(), {
      issuer: new URL(authUrl).origin,
    });
    claims = verified.payload;
  } catch {
    throw new Error("Unauthorized: invalid token");
  }

  const id = typeof claims.sub === "string" ? claims.sub : null;
  const email = emailFromClaims(claims);

  if (!id) throw new Error("Unauthorized: missing user id in token");
  if (!email?.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)) {
    throw new Error(`Unauthorized: only @${ALLOWED_EMAIL_DOMAIN} accounts are allowed`);
  }

  return { id, email };
}

export function bearerTokenFromRequest(request?: Request | null): string | null {
  const req = request ?? getRequest();
  const header = req?.headers?.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token || null;
}

export async function userFromRequest(request?: Request | null): Promise<AuthUser> {
  const token = bearerTokenFromRequest(request);
  if (!token) throw new Error("Unauthorized: no bearer token");
  return userFromBearerToken(token);
}

export async function requireAdminUserId(request?: Request | null): Promise<string> {
  const authUser = await userFromRequest(request);
  const { getUserRoles } = await import("@/lib/auth-bootstrap.server");
  const roles = await getUserRoles(authUser.id);
  if (!roles.includes("admin")) {
    throw new Error("Forbidden: admin access required");
  }
  return authUser.id;
}
