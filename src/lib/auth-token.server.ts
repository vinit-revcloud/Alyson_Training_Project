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

function issuerCandidates(): string[] {
  const authUrl = normalizedAuthUrl();
  const origin = neonAuthIssuer();
  return [...new Set([origin, authUrl, `${authUrl}/`])];
}

function emailFromClaims(claims: JWTPayload): string | null {
  const email =
    (typeof claims.email === "string" && claims.email) ||
    (typeof claims.user_email === "string" && claims.user_email) ||
    (typeof claims.preferred_username === "string" && claims.preferred_username.includes("@")
      ? claims.preferred_username
      : null) ||
    null;
  return email?.toLowerCase() ?? null;
}

async function emailFromInviteToken(inviteToken: string): Promise<string | null> {
  const pool = getPgPool();
  const { rows } = await pool.query<{ email: string; accepted_at: string | null }>(
    `SELECT email, accepted_at FROM invites WHERE token = $1 LIMIT 1`,
    [inviteToken],
  );
  const row = rows[0];
  if (!row || row.accepted_at) return null;
  return row.email.trim().toLowerCase();
}

async function emailFromPendingInvite(email: string): Promise<string | null> {
  const pool = getPgPool();
  const { rows } = await pool.query<{ email: string }>(
    `SELECT email FROM invites
     WHERE lower(email) = lower($1) AND accepted_at IS NULL
     ORDER BY created_at DESC LIMIT 1`,
    [email],
  );
  return rows[0]?.email.trim().toLowerCase() ?? null;
}

function assertAllowedDomain(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!normalized.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)) {
    throw new Error(`Unauthorized: only @${ALLOWED_EMAIL_DOMAIN} accounts are allowed`);
  }
  return normalized;
}

async function resolveEmail(
  userId: string,
  claims: JWTPayload,
  hints?: { inviteToken?: string; emailHint?: string },
): Promise<string> {
  // Invite link is authoritative for first-time signup when JWT may lack email claims.
  if (hints?.inviteToken) {
    const invEmail = await emailFromInviteToken(hints.inviteToken);
    if (invEmail) {
      const hint = hints.emailHint?.trim().toLowerCase();
      if (hint && hint !== invEmail) {
        throw new Error("Email does not match this invite link");
      }
      return assertAllowedDomain(invEmail);
    }
  }

  const fromClaims = emailFromClaims(claims);
  if (fromClaims?.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)) return fromClaims;

  const pool = getPgPool();
  const { rows } = await pool.query<{ email: string }>(
    `SELECT email FROM profiles WHERE user_id = $1 LIMIT 1`,
    [userId],
  );
  const fromProfile = rows[0]?.email?.trim().toLowerCase();
  if (fromProfile?.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)) return fromProfile;

  const hint = hints?.emailHint?.trim().toLowerCase();
  if (hint?.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)) {
    const pending = await emailFromPendingInvite(hint);
    if (pending) return pending;
    return hint;
  }

  throw new Error(`Unauthorized: only @${ALLOWED_EMAIL_DOMAIN} accounts are allowed`);
}

async function verifyJwtPayload(token: string): Promise<JWTPayload> {
  const issuers = issuerCandidates();
  let lastErr: unknown;
  for (const issuer of issuers) {
    try {
      const verified = await jwtVerify(token, neonJwks(), { issuer });
      return verified.payload;
    } catch (err) {
      lastErr = err;
    }
  }
  try {
    const verified = await jwtVerify(token, neonJwks());
    return verified.payload;
  } catch {
    const detail = lastErr instanceof Error ? lastErr.message : String(lastErr);
    throw new Error(`Unauthorized: invalid token (${detail})`);
  }
}

/** Verify Neon Auth JWT signature, expiry, and issuer. */
export async function userFromBearerToken(
  token: string,
  hints?: { inviteToken?: string; emailHint?: string },
): Promise<AuthUser> {
  const claims = await verifyJwtPayload(token);
  const id = typeof claims.sub === "string" ? claims.sub : null;
  if (!id) throw new Error("Unauthorized: missing user id in token");

  const email = await resolveEmail(id, claims, hints);
  return { id, email };
}

export function bearerTokenFromRequest(request?: Request | null): string | null {
  const req = request ?? getRequest();
  const header = req?.headers?.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token || null;
}

export async function userFromRequest(
  request?: Request | null,
  hints?: { inviteToken?: string; emailHint?: string },
): Promise<AuthUser> {
  const token = bearerTokenFromRequest(request);
  if (!token) throw new Error("Unauthorized: no bearer token");
  const user = await userFromBearerToken(token, hints);
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
