import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getLearnerDashboardFn, getPendingPolicyCountFn } from "@/lib/onboarding/onboarding.functions";
import { LearnDashboard } from "@/components/learn/LearnDashboard";
import { QueryLoadError } from "@/components/admin/QueryLoadError";

export const Route = createFileRoute("/learn/dashboard")({
  component: LearnDashboardPage,
});

function LearnDashboardPage() {
  const load = useServerFn(getLearnerDashboardFn);
  const loadPolicies = useServerFn(getPendingPolicyCountFn);
  const {
    data,
    isLoading,
    isError: dashboardError,
    refetch: refetchDashboard,
  } = useQuery({
    queryKey: ["learner-dashboard"],
    queryFn: () => load(),
  });
  const { data: policyPending, isError: policyError, refetch: refetchPolicies } = useQuery({
    queryKey: ["learner-policy-pending"],
    queryFn: () => loadPolicies(),
  });

  if (dashboardError) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <QueryLoadError message="Could not load your dashboard" onRetry={() => void refetchDashboard()} />
      </div>
    );
  }

  return (
    <>
      {policyError ? (
        <div className="mx-auto max-w-3xl px-6 pt-6">
          <QueryLoadError
            message="Could not check policy acknowledgements"
            onRetry={() => void refetchPolicies()}
          />
        </div>
      ) : null}
      <LearnDashboard
        data={data}
        isLoading={isLoading}
        policyPending={policyPending?.pending ?? 0}
        resumeCourseId={data?.resumeCourseId}
        resumeSectionId={data?.resumeSectionId}
      />
    </>
  );
}
