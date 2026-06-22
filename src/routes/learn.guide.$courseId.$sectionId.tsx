import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { getSectionContentFn, markSectionVisitedFn } from "@/lib/onboarding/onboarding.functions";
import { SectionReader } from "@/components/learn/SectionReader";

export const Route = createFileRoute("/learn/guide/$courseId/$sectionId")({
  component: SectionGuidePage,
});

function SectionGuidePage() {
  const { courseId, sectionId } = Route.useParams();
  const load = useServerFn(getSectionContentFn);
  const markVisited = useServerFn(markSectionVisitedFn);

  const { data: section, isLoading } = useQuery({
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

  if (!section) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[var(--learn-bg)] p-8 text-sm text-muted-foreground">
        Section not found.
      </div>
    );
  }

  return <SectionReader section={section} />;
}
