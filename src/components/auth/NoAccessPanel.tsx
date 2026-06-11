import alysonLogo from "@/assets/alyson-logo.svg";
import { AUTH_SEARCH_DEFAULTS } from "@/lib/auth-constants";
import { signOut } from "@/lib/auth";

export function NoAccessPanel({
  email,
  onSignOut,
}: {
  email?: string | null;
  onSignOut?: () => void;
}) {
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
          {email ? (
            <>
              Your account ({email}) is not invited to this workspace yet. Please contact an
              administrator to receive an invite.
            </>
          ) : (
            <>You need an invite to access Alyson Training. Contact an administrator.</>
          )}
        </p>
        <button
          onClick={async () => {
            await signOut();
            onSignOut?.();
          }}
          className="mt-6 h-10 w-full rounded-[8px] text-[13px] font-medium text-white hover:opacity-95"
          style={{ backgroundColor: "#3B82F6" }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
