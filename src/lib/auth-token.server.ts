import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { getRequest } from "@tanstack/react-start/server";
import { ALLOWED_EMAIL_DOMAIN } from "@/lib/auth-constants";
import { getNeonAuthUrl } from "@/integrations/neon/env";
import { getPgPool } from "@/lib/pg.server";
import { assertActiveUser } from "@/lib/profile-status.server";

export interface AuthUser {
  id: string;
  email: string;
}

let jwksCache: { authUrl: string; jwks: ReturnType<typeof createRemoteJWKSet> } | null = null;

function normalizedAuthUrl(): string {
  return getNeonAuthUrl().replace(/\/$/, "");
}

/** Neon Auth issuer is the origin; JWKS lives under the full auth URL path. */
function neonAuthIssuer(): string {
  return new URL(normalizedAuthUrl()).origin;
}

function neonJwksUrl(): string {
  return `${normalizedAuthUrl()}/.well-known/jwks.json`;
}

function neonJwks(): ReturnType<typeof createRemoteJWKSet> {
  const authUrl = normalizedAuthUrl();
  if (!jwksCache || jwksCache.authUrl !== authUrl) {
    jwksCache = {
      authUrl,
      jwks: createRemoteJWKSet(new URL(neonJwksUrl())),
    };
  }
  return jwksCache.jwks;
}

function emailFromClaims(claims: JWTPayload): string | null {
  const email =
    (typeof claims.email === "string" && claims.email) ||
    (typeof claims.user_email === "string" && claims.user_email) ||
    null;
  return email?.toLowerCase() ?? null;
}

async function resolveEmail(userId: string, claims: JWTPayload): Promise<string> {
  const fromClaims = emailFromClaims(claims);
  if (fromClaims?.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)) return fromClaims;

  const pool = getPgPool();
  const { rows } = await pool.query<{ email: string }>(
    `SELECT email FROM profiles WHERE user_id = $1 LIMIT 1`,
    [userId],
  );
  const email = rows[0]?.email?.trim().toLowerCase();
  if (!email?.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)) {
    throw new Error(`Unauthorized: only @${ALLOWED_EMAIL_DOMAIN} accounts are allowed`);
  }
  return email;
}

/** Verify Neon Auth JWT signature, expiry, and issuer. */
export async function userFromBearerToken(token: string): Promise<AuthUser> {
  const issuer = neonAuthIssuer();
  let claims: JWTPayload;
  try {
    const verified = await jwtVerify(token, neonJwks(), { issuer });
    claims = verified.payload;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`Unauthorized: invalid token (${detail})`);
  }

  const id = typeof claims.sub === "string" ? claims.sub : null;
  if (!id) throw new Error("Unauthorized: missing user id in token");

  const email = await resolveEmail(id, claims);
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
  const user = await userFromBearerToken(token);
  await assertActiveUser(user.id);
  return user;
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
