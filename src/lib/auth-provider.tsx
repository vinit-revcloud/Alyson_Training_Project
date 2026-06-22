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
import { apiBootstrapUser } from "@/lib/auth-client";

export function stashInviteToken(token: string | null | undefined): void {
  if (typeof window === "undefined" || !token?.trim()) return;
  localStorage.setItem(INVITE_TOKEN_STORAGE_KEY, token.trim());
}

function readInviteToken(): string | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(INVITE_TOKEN_STORAGE_KEY);
  if (stored?.trim()) return stored.trim();
  const params = new URLSearchParams(window.location.search);
  const urlToken = params.get("token")?.trim();
  if (urlToken) {
    localStorage.setItem(INVITE_TOKEN_STORAGE_KEY, urlToken);
    return urlToken;
  }
  return null;
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

async function resolveAuthToken(attempt = 0): Promise<string | null> {
  const { data, error } = await db.auth.getSession();
  if (!error) {
    const access = data.session?.access_token?.trim();
    if (access) return access;
  }
  if (typeof db.auth.getJWTToken === "function") {
    try {
      const jwt = await db.auth.getJWTToken();
      if (jwt?.trim()) return jwt.trim();
    } catch {
      /* fall through */
    }
  }
  if (attempt < 4) {
    await sleep(400);
    return resolveAuthToken(attempt + 1);
  }
  return null;
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
  const emailHint = sess.user.email?.trim().toLowerCase() || undefined;

  try {
    const result = await apiBootstrapUser(token, { inviteToken, displayName, emailHint });
    if (result.roles.length > 0) {
      clearInviteToken();
      return result.roles;
    }
    if (inviteToken) {
      throw new Error(
        "Invite could not be applied. Open the invite link again, then click Retry setup.",
      );
    }
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
    throw err instanceof Error ? err : new Error(message);
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
      setRoles(resolvedRoles);
      if (resolvedRoles.length > 0) {
        bootstrappedFor.current = sess.user.id;
        clearInviteToken();
      } else {
        bootstrappedFor.current = sess.user.id;
        setBootstrapError(
          "No workspace roles assigned. Open your invite link again, then click Retry setup.",
        );
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
    if (session?.user?.id) bootstrapInflight.delete(session.user.id);
    readInviteToken();
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
