import { useCallback, useEffect, useRef, useState } from "react";
import type { AppSession } from "@/integrations/neon/client-types";
import { db } from "@/integrations/neon/client";
import { INVITE_TOKEN_STORAGE_KEY, isAllowedEmail } from "@/lib/auth-constants";
import { bootstrapAuthUser, fetchMyRoles } from "@/lib/auth.functions";

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
  return betterAuth.useSession.subscribe((value) => {
    if (value.data?.session) onChange();
    else if (!value.data?.session) onChange();
  });
}

export function useSession() {
  const [session, setSession] = useState<AppSession | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [initializing, setInitializing] = useState(true);
  const [bootstrapping, setBootstrapping] = useState(false);
  const bootstrappedFor = useRef<string | null>(null);

  const runBootstrap = useCallback(async (sess: AppSession, attempt = 0) => {
    if (bootstrappedFor.current === sess.user.id) return;
    setBootstrapping(true);
    try {
      const inviteToken = readInviteToken() ?? undefined;
      const metadata = sess.user.user_metadata ?? {};
      const displayName =
        (typeof metadata.display_name === "string" && metadata.display_name) ||
        (typeof metadata.displayName === "string" && metadata.displayName) ||
        (typeof metadata.name === "string" && metadata.name) ||
        undefined;

      const result = await bootstrapAuthUser({
        data: { inviteToken, displayName },
      });
      clearInviteToken();
      bootstrappedFor.current = sess.user.id;
      let resolvedRoles = result.roles;
      if (resolvedRoles.length === 0) {
        try {
          const fallback = await fetchMyRoles();
          resolvedRoles = fallback.roles;
        } catch {
          /* keep empty */
        }
      }
      setRoles(resolvedRoles);
    } catch (err) {
      const suspended =
        err instanceof Error &&
        (err.message.includes("account is suspended") || err.name === "AccountSuspendedError");
      if (suspended) {
        bootstrappedFor.current = sess.user.id;
        setRoles([]);
        await db.auth.signOut();
        return;
      }
      const unauthorized =
        err instanceof Error &&
        (err.message.includes("Unauthorized") || err.message.includes("bearer token"));
      if (unauthorized && attempt < 3) {
        await sleep(500);
        return runBootstrap(sess, attempt + 1);
      }
      console.error("auth bootstrap failed", err);
      try {
        const fallback = await fetchMyRoles();
        bootstrappedFor.current = sess.user.id;
        setRoles(fallback.roles);
      } catch {
        setRoles([]);
      }
    } finally {
      setBootstrapping(false);
    }
  }, []);

  useEffect(() => {
    const apply = (sess: AppSession | null) => {
      if (!sess?.user?.id) {
        setSession(null);
        setRoles([]);
        setInitializing(false);
        bootstrappedFor.current = null;
        return;
      }

      if (!isAllowedEmail(sess.user.email)) {
        setSession(null);
        setRoles([]);
        setInitializing(false);
        bootstrappedFor.current = null;
        void db.auth.signOut();
        return;
      }

      setSession(sess);
      setInitializing(false);
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

    // Same-tab sign-in does not fire onAuthStateChange (Neon broadcast skips own tab).
    const unsubBetter = subscribeSameTabSession(syncFromStorage);

    void readAuthSession().then(apply);

    return () => {
      sub.subscription.unsubscribe();
      unsubBetter?.();
    };
  }, [runBootstrap]);

  return {
    session,
    roles,
    loading: initializing,
    bootstrapping,
    user: session?.user ?? null,
  };
}

export async function signOut() {
  await db.auth.signOut();
}
