import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { QueryLoadError } from "@/components/admin/QueryLoadError";
import { getSectionContentFn, markSectionVisitedFn } from "@/lib/onboarding/onboarding.functions";
import { SectionReader } from "@/components/learn/SectionReader";

const guideParamsSchema = z.object({
  courseId: z.string().uuid(),
  sectionId: z.string().uuid(),
});

export const Route = createFileRoute("/learn/guide/$courseId/$sectionId")({
  params: guideParamsSchema,
  component: SectionGuidePage,
});

function SectionGuidePage() {
  const { courseId, sectionId } = Route.useParams();
  const load = useServerFn(getSectionContentFn);
  const markVisited = useServerFn(markSectionVisitedFn);

  const { data: section, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["section-content", courseId, sectionId],
    queryFn: () => load({ data: { courseId, sectionId } }),
  });

  useEffect(() => {
    if (!section?.classId) return;
    void markVisited({
      data: { courseId, sectionId, classId: section.classId },
    });
  }, [section?.classId, courseId, sectionId, markVisited]);

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[var(--learn-bg)] p-8 text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (isError) {
    const msg = error instanceof Error ? error.message : "";
    const denied = msg.includes("do not have access");
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-[var(--learn-bg)] p-8 text-center">
        {denied ? (
          <>
            <p className="text-sm font-medium">Section not available</p>
            <p className="mt-2 text-sm text-muted-foreground">
              This module is not part of your learning path.
            </p>
            <Button asChild variant="link" className="mt-2">
              <Link to="/learn/dashboard">Back to dashboard</Link>
            </Button>
          </>
        ) : (
          <QueryLoadError message="Could not load this section" onRetry={() => void refetch()} />
        )}
      </div>
    );
  }

  if (!section) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-[var(--learn-bg)] p-8 text-center">
        <p className="text-sm font-medium">Section not found</p>
        <p className="mt-2 text-sm text-muted-foreground">
          It may have been removed or is not published yet.
        </p>
        <Button asChild variant="link" className="mt-2">
          <Link to="/learn/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    );
  }

  return <SectionReader section={section} />;
}
