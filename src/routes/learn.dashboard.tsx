import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getLearnerDashboardFn, getPendingPolicyCountFn } from "@/lib/onboarding/onboarding.functions";
import { LearnDashboard } from "@/components/learn/LearnDashboard";

export const Route = createFileRoute("/learn/dashboard")({
  component: LearnDashboardPage,
});

function LearnDashboardPage() {
  const load = useServerFn(getLearnerDashboardFn);
  const loadPolicies = useServerFn(getPendingPolicyCountFn);
  const { data, isLoading } = useQuery({
    queryKey: ["learner-dashboard"],
    queryFn: () => load(),
  });
  const { data: policyPending } = useQuery({
    queryKey: ["learner-policy-pending"],
    queryFn: () => loadPolicies(),
  });

  return (
    <LearnDashboard
      data={data}
      isLoading={isLoading}
      policyPending={policyPending?.pending ?? 0}
      resumeCourseId={data?.resumeCourseId}
      resumeSectionId={data?.resumeSectionId}
    />
  );
}
