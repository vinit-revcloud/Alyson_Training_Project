/** Client-side auth API — stable REST endpoints (avoids TanStack server-fn ID staleness in dev). */

export type BootstrapInput = {
  inviteToken?: string;
  displayName?: string;
  emailHint?: string;
};

export type BootstrapResult = {
  userId: string;
  email: string;
  roles: string[];
};

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error?.trim()) return body.error.trim();
  } catch {
    /* ignore */
  }
  return `Request failed (${res.status})`;
}

export async function apiBootstrapUser(
  token: string,
  input: BootstrapInput,
): Promise<BootstrapResult> {
  const res = await fetch("/api/auth/bootstrap", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json() as Promise<BootstrapResult>;
}

export async function apiFetchRoles(token: string): Promise<string[]> {
  const res = await fetch("/api/auth/roles", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await readError(res));
  const body = (await res.json()) as { roles?: string[] };
  return body.roles ?? [];
}
