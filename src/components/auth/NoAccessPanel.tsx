import alysonLogo from "@/assets/alyson-logo.svg";
import { AUTH_SEARCH_DEFAULTS } from "@/lib/auth-constants";
import { signOut } from "@/lib/auth-provider";

export function NoAccessPanel({
  email,
  detail,
  onRetry,
  onSignOut,
}: {
  email?: string | null;
  detail?: string | null;
  onRetry?: () => void;
  onSignOut?: () => void;
}) {
  const isInviteIssue = !detail || detail.includes("No workspace roles");

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4"
      style={{ backgroundColor: "#F8FAFC" }}
    >
      <div
        className="w-full max-w-md rounded-[12px] border bg-white p-8 text-center"
        style={{ borderColor: "#E5E7EB", fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}
      >
        <img src={alysonLogo} alt="Alyson" className="mx-auto h-10 w-auto" />
        <h1 className="mt-4 text-[24px] font-semibold tracking-tight" style={{ color: "#0F172A" }}>
          No Access
        </h1>
        <p className="mt-2 text-[13px]" style={{ color: "#6B7280" }}>
          {isInviteIssue ? (
            email ? (
              <>
                Your account ({email}) is not invited to this workspace yet. Please contact an
                administrator to receive an invite.
              </>
            ) : (
              <>You need an invite to access Alyson Training. Contact an administrator.</>
            )
          ) : (
            <>We could not verify your session. Sign out and try again, or retry setup below.</>
          )}
        </p>
        {detail ? (
          <p
            className="mt-3 rounded-lg border px-3 py-2 text-left text-[11px] break-words"
            style={{ borderColor: "#FECACA", backgroundColor: "#FEF2F2", color: "#991B1B" }}
          >
            {detail}
          </p>
        ) : null}
        <div className="mt-6 flex flex-col gap-2">
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="h-10 w-full rounded-[8px] border text-[13px] font-medium hover:bg-slate-50"
              style={{ borderColor: "#E5E7EB", color: "#0F172A" }}
            >
              Retry setup
            </button>
          ) : null}
          <button
            type="button"
            onClick={async () => {
              await signOut();
              onSignOut?.();
            }}
            className="h-10 w-full rounded-[8px] text-[13px] font-medium text-white hover:opacity-95"
            style={{ backgroundColor: "#3B82F6" }}
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
