import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AppSession } from "@/integrations/neon/client-types";
import { db } from "@/integrations/neon/client";
import { INVITE_TOKEN_STORAGE_KEY, isAllowedEmail } from "@/lib/auth-constants";
import { apiBootstrapUser, apiFetchRoles } from "@/lib/auth-client";

export function stashInviteToken(token: string | null | undefined): void {
  if (typeof window === "undefined" || !token?.trim()) return;
  localStorage.setItem(INVITE_TOKEN_STORAGE_KEY, token.trim());
}

function readInviteToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(INVITE_TOKEN_STORAGE_KEY);
}

function clearInviteToken(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(INVITE_TOKEN_STORAGE_KEY);
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Neon Auth skips same-tab broadcast — call after signInWithPassword to read the new session. */
export async function readAuthSession(): Promise<AppSession | null> {
  const { data, error } = await db.auth.getSession();
  if (error) return null;
  return (data.session as AppSession | null) ?? null;
}

async function resolveAuthToken(): Promise<string | null> {
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
  return data.session?.access_token?.trim() ?? null;
}

type BetterAuthSessionSubscriber = {
  getBetterAuthInstance?: () => {
    useSession: {
      subscribe: (listener: (value: { data: { session: unknown } | null }) => void) => () => void;
    };
  };
};

function subscribeSameTabSession(onChange: () => void): (() => void) | undefined {
  const adapter = db.auth as BetterAuthSessionSubscriber;
  const betterAuth = adapter.getBetterAuthInstance?.();
  if (!betterAuth?.useSession?.subscribe) return undefined;
  return betterAuth.useSession.subscribe(() => onChange());
}

type AuthContextValue = {
  session: AppSession | null;
  roles: string[];
  loading: boolean;
  bootstrapping: boolean;
  bootstrapError: string | null;
  user: AppSession["user"] | null;
  retryBootstrap: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const bootstrapInflight = new Map<string, Promise<string[]>>();

async function bootstrapRolesForSession(sess: AppSession, attempt = 0): Promise<string[]> {
  const token = await resolveAuthToken();
  if (!token) {
    if (attempt < 4) {
      await sleep(400);
      return bootstrapRolesForSession(sess, attempt + 1);
    }
    throw new Error("Unauthorized: no bearer token");
  }

  const metadata = sess.user.user_metadata ?? {};
  const displayName =
    (typeof metadata.display_name === "string" && metadata.display_name) ||
    (typeof metadata.displayName === "string" && metadata.displayName) ||
    (typeof metadata.name === "string" && metadata.name) ||
    undefined;

  const inviteToken = readInviteToken() ?? undefined;

  try {
    const result = await apiBootstrapUser(token, { inviteToken, displayName });
    if (result.roles.length > 0) clearInviteToken();
    return result.roles;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const retryable =
      message.includes("Unauthorized") ||
      message.includes("bearer token") ||
      message.includes("invalid token");
    if (retryable && attempt < 3) {
      await sleep(500);
      return bootstrapRolesForSession(sess, attempt + 1);
    }
    try {
      const roles = await apiFetchRoles(token);
      if (roles.length > 0) clearInviteToken();
      return roles;
    } catch (fallbackErr) {
      throw err instanceof Error ? err : fallbackErr;
    }
  }
}

function ensureBootstrap(sess: AppSession): Promise<string[]> {
  const existing = bootstrapInflight.get(sess.user.id);
  if (existing) return existing;

  const promise = bootstrapRolesForSession(sess).finally(() => {
    bootstrapInflight.delete(sess.user.id);
  });
  bootstrapInflight.set(sess.user.id, promise);
  return promise;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AppSession | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const bootstrappedFor = useRef<string | null>(null);
  const retryNonce = useRef(0);

  const runBootstrap = useCallback(async (sess: AppSession) => {
    setBootstrapping(true);
    setBootstrapError(null);
    try {
      const resolvedRoles = await ensureBootstrap(sess);
      bootstrappedFor.current = sess.user.id;
      setRoles(resolvedRoles);
      if (resolvedRoles.length === 0) {
        setBootstrapError("No workspace roles assigned. Ask an admin for an invite.");
      }
    } catch (err) {
      const suspended =
        err instanceof Error &&
        (err.message.includes("account is suspended") || err.name === "AccountSuspendedError");
      if (suspended) {
        bootstrappedFor.current = sess.user.id;
        setRoles([]);
        setBootstrapError("Your account is suspended.");
        await db.auth.signOut();
        return;
      }
      console.error("auth bootstrap failed", err);
      bootstrappedFor.current = null;
      setRoles([]);
      setBootstrapError(err instanceof Error ? err.message : "Authentication setup failed");
    } finally {
      setBootstrapping(false);
    }
  }, []);

  const retryBootstrap = useCallback(() => {
    retryNonce.current += 1;
    bootstrappedFor.current = null;
    if (session?.user?.id) void runBootstrap(session);
  }, [session, runBootstrap]);

  useEffect(() => {
    const apply = (sess: AppSession | null) => {
      if (!sess?.user?.id) {
        setSession(null);
        setRoles([]);
        setBootstrapError(null);
        setLoading(false);
        bootstrappedFor.current = null;
        return;
      }

      if (!isAllowedEmail(sess.user.email)) {
        setSession(null);
        setRoles([]);
        setBootstrapError(null);
        setLoading(false);
        bootstrappedFor.current = null;
        void db.auth.signOut();
        return;
      }

      setSession(sess);
      setLoading(false);
      if (bootstrappedFor.current !== sess.user.id) {
        void runBootstrap(sess);
      }
    };

    const syncFromStorage = () => {
      void readAuthSession().then(apply);
    };

    const { data: sub } = db.auth.onAuthStateChange((_event, s) => {
      apply(s as AppSession | null);
    });

    const unsubBetter = subscribeSameTabSession(syncFromStorage);
    void readAuthSession().then(apply);

    return () => {
      sub.subscription.unsubscribe();
      unsubBetter?.();
    };
  }, [runBootstrap]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      roles,
      loading,
      bootstrapping,
      bootstrapError,
      user: session?.user ?? null,
      retryBootstrap,
    }),
    [session, roles, loading, bootstrapping, bootstrapError, retryBootstrap],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useSession(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useSession must be used within AuthProvider");
  }
  return ctx;
}

export async function signOut() {
  await db.auth.signOut();
}
