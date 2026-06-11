import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import alysonLogo from "@/assets/alyson-logo.svg";
import { db } from "@/integrations/neon/client";
import {
  ALLOWED_EMAIL_DOMAIN,
  AUTH_SEARCH_DEFAULTS,
  buildAuthCallbackUrl,
  isAllowedEmail,
  postAuthHomePath,
} from "@/lib/auth-constants";
import { readAuthSession, stashInviteToken, useSession } from "@/lib/auth";
import { NoAccessPanel } from "@/components/auth/NoAccessPanel";
import { previewInvite } from "@/lib/invites-api";
import { roleLabel } from "@/lib/role-access";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>) => ({
    mode: search.mode === "signup" ? ("signup" as const) : ("signin" as const),
    email: typeof search.email === "string" ? search.email : "",
    token: typeof search.token === "string" ? search.token : "",
  }),
  head: () => ({ meta: [{ title: "Sign in — Alyson Training" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { mode: searchMode, email: searchEmail, token: searchToken } = Route.useSearch();
  const { session, roles, loading, bootstrapping } = useSession();
  const [mode, setMode] = useState<"signin" | "signup">(searchMode);
  const [email, setEmail] = useState(searchEmail);
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (searchToken) stashInviteToken(searchToken);
  }, [searchToken]);

  useEffect(() => {
    if (searchEmail) setEmail(searchEmail);
  }, [searchEmail]);

  const { data: invitePreview } = useQuery({
    queryKey: ["invite-preview", searchToken, email],
    queryFn: () =>
      previewInvite(searchToken, email.trim().toLowerCase() || undefined),
    enabled: !!searchToken,
  });

  useEffect(() => {
    if (loading || bootstrapping || !session) return;
    const target = postAuthHomePath(roles);
    if (target === "/auth") return;
    navigate({ to: target, replace: true });
  }, [loading, bootstrapping, session, roles, navigate]);

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!isAllowedEmail(normalized)) {
      toast.error("Invalid email", {
        description: `Use your @${ALLOWED_EMAIL_DOMAIN} address.`,
      });
      return;
    }
    if (searchToken && invitePreview?.valid && invitePreview.email !== normalized) {
      toast.error("Email mismatch", {
        description: `This invite is for ${invitePreview.email}.`,
      });
      return;
    }
    if (searchToken && invitePreview && !invitePreview.valid) {
      toast.error("Invite invalid", {
        description:
          invitePreview.reason === "expired"
            ? "This invite has expired. Ask an admin to resend."
            : "This invite link is no longer valid.",
      });
      return;
    }
    setBusy(true);
    try {
      const authCallback = buildAuthCallbackUrl(window.location.origin, {
        token: searchToken || undefined,
        email: normalized,
        mode,
      });

      if (mode === "signup") {
        const displayName = name.trim() || normalized.split("@")[0];
        const { data, error } = await db.auth.signUp({
          email: normalized,
          password,
          options: {
            emailRedirectTo: authCallback,
            data: { displayName, display_name: displayName, name: displayName },
          },
        });
        if (error) throw error;
        if (data.session) {
          toast.success("Welcome to Alyson Training");
          return;
        }
        toast.success("Check your email", {
          description: "Confirm your address to finish sign-up. Your invite will apply automatically.",
        });
      } else {
        const { data, error } = await db.auth.signInWithPassword({
          email: normalized,
          password,
        });
        if (error) throw error;
        const active = data.session ?? (await readAuthSession());
        if (!active) {
          throw new Error("Sign-in succeeded but no session was created. Check Neon Auth trusted domains.");
        }
        toast.success("Welcome back");
      }
    } catch (err) {
      toast.error("Authentication failed", {
        description: err instanceof Error ? err.message : "Try again.",
      });
    } finally {
      setBusy(false);
    }
  };

  const signInWithGoogle = async () => {
    if (searchToken && invitePreview?.valid && invitePreview.email) {
      stashInviteToken(searchToken);
    }
    setBusy(true);
    try {
      const redirectTo = buildAuthCallbackUrl(window.location.origin, {
        token: searchToken || undefined,
        email: (invitePreview?.email ?? email.trim().toLowerCase()) || undefined,
        mode: searchMode,
      });
      const { error } = await db.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          queryParams: { hd: ALLOWED_EMAIL_DOMAIN, prompt: "select_account" },
        },
      });
      if (error) toast.error("Google sign-in failed", { description: error.message });
    } catch (err) {
      toast.error("Google sign-in failed", {
        description: err instanceof Error ? err.message : "Try again.",
      });
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ backgroundColor: "#F8FAFC" }}>
        <p className="text-[13px] text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (session && bootstrapping) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ backgroundColor: "#F8FAFC" }}>
        <p className="text-[13px] text-muted-foreground">Setting up your workspace…</p>
      </div>
    );
  }

  if (session && roles.length === 0) {
    return (
      <NoAccessPanel
        email={session.user.email}
        onSignOut={() => navigate({ to: "/auth", search: AUTH_SEARCH_DEFAULTS })}
      />
    );
  }

  if (session) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ backgroundColor: "#F8FAFC" }}>
        <p className="text-[13px] text-muted-foreground">Redirecting to dashboard…</p>
      </div>
    );
  }

  const inviteBanner = searchToken ? (
    <div
      className="mb-4 rounded-lg border px-3 py-2.5 text-[12px]"
      style={{
        borderColor: invitePreview?.valid ? "#BFDBFE" : "#FECACA",
        backgroundColor: invitePreview?.valid ? "#EFF6FF" : "#FEF2F2",
        color: invitePreview?.valid ? "#1E40AF" : "#991B1B",
      }}
    >
      {invitePreview?.valid ? (
        <>
          You&apos;re invited to join as{" "}
          <strong>{roleLabel(invitePreview.role!)}</strong>
          {invitePreview.department ? ` · ${invitePreview.department}` : ""}. Sign in with{" "}
          <strong>{invitePreview.email}</strong>.
        </>
      ) : invitePreview?.reason === "expired" ? (
        <>This invite has expired. Contact an admin for a new link.</>
      ) : invitePreview?.reason === "accepted" ? (
        <>This invite was already used. Try signing in.</>
      ) : searchToken ? (
        <>Checking invite…</>
      ) : null}
    </div>
  ) : null;

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4"
      style={{
        backgroundColor: "#F8FAFC",
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <div
        className="w-full max-w-md rounded-[12px] border bg-white p-8"
        style={{ borderColor: "#E5E7EB", boxShadow: "0 1px 2px rgba(15,23,42,0.04)" }}
      >
        <div className="mb-6 flex flex-col items-center gap-3">
          <img src={alysonLogo} alt="Alyson" className="h-10 w-auto" />
          <div className="text-center">
            <h1 className="text-[24px] font-semibold tracking-tight" style={{ color: "#0F172A" }}>
              Alyson Training
            </h1>
            <p className="mt-1 text-[12px]" style={{ color: "#6B7280" }}>
              {searchToken
                ? "Accept your invite to get started"
                : "Sign in with Google or your @cintara.ai email"}
            </p>
          </div>
        </div>

        {inviteBanner}

        <button
          type="button"
          onClick={signInWithGoogle}
          disabled={busy || (searchToken && invitePreview && !invitePreview.valid)}
          className="mb-4 flex h-10 w-full items-center justify-center gap-2 rounded-[8px] border bg-white text-[13px] font-medium transition hover:bg-slate-50 disabled:opacity-60"
          style={{ borderColor: "#E5E7EB", color: "#0F172A" }}
        >
          <GoogleIcon />
          Continue with Google
        </button>

        <div className="my-4 flex items-center gap-3">
          <div className="h-px flex-1" style={{ backgroundColor: "#E5E7EB" }} />
          <span className="text-[11px] uppercase tracking-wider" style={{ color: "#9CA3AF" }}>
            or email
          </span>
          <div className="h-px flex-1" style={{ backgroundColor: "#E5E7EB" }} />
        </div>

        <form onSubmit={submitPassword} className="space-y-3">
          {mode === "signup" ? (
            <Field label="Display name">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Doe"
                className="h-10 rounded-[8px] bg-white"
                style={{ borderColor: "#E5E7EB" }}
              />
            </Field>
          ) : null}
          <Field label="Email">
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={`you@${ALLOWED_EMAIL_DOMAIN}`}
              readOnly={!!invitePreview?.valid && !!invitePreview.email}
              className="h-10 rounded-[8px] bg-white"
              style={{ borderColor: "#E5E7EB" }}
            />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="h-10 rounded-[8px] bg-white"
              style={{ borderColor: "#E5E7EB" }}
            />
          </Field>
          <Button
            type="submit"
            disabled={
              busy || (searchToken && invitePreview && !invitePreview.valid ? true : false)
            }
            className="h-10 w-full rounded-[8px] text-[13px] font-medium text-white hover:opacity-95"
            style={{ backgroundColor: "#3B82F6" }}
          >
            {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </Button>
        </form>

        <div className="mt-5 text-center text-[12px]" style={{ color: "#6B7280" }}>
          {mode === "signin" ? (
            <>
              No account?{" "}
              <button
                type="button"
                onClick={() => setMode("signup")}
                className="font-semibold hover:underline"
                style={{ color: "#3B82F6" }}
              >
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have one?{" "}
              <button
                type="button"
                onClick={() => setMode("signin")}
                className="font-semibold hover:underline"
                style={{ color: "#3B82F6" }}
              >
                Sign in
              </button>
            </>
          )}
        </div>
        {!searchToken ? (
          <p className="mt-3 text-center text-[10.5px]" style={{ color: "#9CA3AF" }}>
            Need access? Ask an admin to invite your @cintara.ai address.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[12px] font-medium" style={{ color: "#6B7280" }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.8 32.4 29.3 35.5 24 35.5c-6.4 0-11.5-5.1-11.5-11.5S17.6 12.5 24 12.5c2.9 0 5.6 1.1 7.6 2.9l5.7-5.7C33.8 6.4 29.1 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5 43.5 34.8 43.5 24c0-1.2-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 12.5 24 12.5c2.9 0 5.6 1.1 7.6 2.9l5.7-5.7C33.8 6.4 29.1 4.5 24 4.5 16.3 4.5 9.7 8.9 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 43.5c5 0 9.6-1.9 13-5l-6-5.1c-2 1.4-4.4 2.2-7 2.2-5.3 0-9.7-3.1-11.3-7.5l-6.5 5C9.5 39 16.2 43.5 24 43.5z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.4 4.2-4.3 5.4l6 5.1c-.4.4 6.5-4.7 6.5-14.5 0-1.2-.1-2.4-.4-3.5z" />
    </svg>
  );
}
