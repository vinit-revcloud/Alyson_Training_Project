import { db } from "@/integrations/neon/client";

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Resolve Neon Auth bearer token for API calls (JWT preferred, then session access_token). */
export async function resolveAuthToken(attempt = 0): Promise<string | null> {
  if (typeof db.auth.getJWTToken === "function") {
    try {
      const jwt = await db.auth.getJWTToken();
      if (jwt?.trim()) return jwt.trim();
    } catch {
      /* fall through */
    }
  }
  const { data, error } = await db.auth.getSession();
  if (error) return null;
  const token = data.session?.access_token?.trim() ?? null;
  if (token) return token;
  if (attempt < 4) {
    await sleep(400);
    return resolveAuthToken(attempt + 1);
  }
  return null;
}

/** Require a bearer token before protected API calls. */
export async function ensureAuthToken(): Promise<string> {
  const token = await resolveAuthToken();
  if (!token) {
    throw new Error("Not authenticated — sign in again");
  }
  return token;
}

export async function authHeaderRecord(): Promise<Record<string, string>> {
  const token = await resolveAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function readApiError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string; message?: string; details?: string };
    if (body.error?.trim() && body.details?.trim()) {
      return `${body.error.trim()}: ${body.details.trim()}`;
    }
    if (body.error?.trim()) return body.error.trim();
    if (body.message?.trim()) return body.message.trim();
  } catch {
    /* ignore */
  }
  return `Request failed (${res.status})`;
}

export async function authenticatedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const token = await ensureAuthToken();
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (
    init?.body &&
    !(init.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(input, { ...init, headers, credentials: "include" });
}
