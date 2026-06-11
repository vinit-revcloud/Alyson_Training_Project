import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { listMyCourses } from "@/lib/learn-api";
import { useSession } from "@/lib/auth";
import { GraduationCap } from "lucide-react";

export const Route = createFileRoute("/learn/courses")({
  component: LearnCoursesLayout,
});

function LearnCoursesLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isIndex = pathname === "/learn/courses";

  if (!isIndex) return <Outlet />;

  return <LearnCoursesIndex />;
}

function LearnCoursesIndex() {
  const { user } = useSession();
  const { data: courses = [], isLoading } = useQuery({
    queryKey: ["my-courses", user?.id],
    queryFn: () => listMyCourses(user!.id),
    enabled: !!user?.id,
  });

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <h1 className="text-xl font-semibold tracking-tight">My Courses</h1>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : courses.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          No courses assigned to your department yet.
        </Card>
      ) : (
        courses.map((c) => (
          <Link key={c.id} to="/learn/courses/$courseId/study" params={{ courseId: c.id }}>
            <Card className="overflow-hidden transition hover:shadow-md">
              <div className="bg-gradient-hero px-4 py-5 text-white">
                <div className="flex items-center gap-2">
                  <GraduationCap className="h-5 w-5" />
                  <h2 className="text-sm font-semibold">{c.title}</h2>
                </div>
                {c.role ? <p className="mt-1 text-xs text-white/80">{c.role}</p> : null}
              </div>
              <div className="space-y-2 p-4">
                {c.description ? (
                  <p className="line-clamp-2 text-xs text-muted-foreground">{c.description}</p>
                ) : null}
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{c.class_count} classes</span>
                  <Badge variant="secondary">{c.progress_pct}% complete</Badge>
                </div>
                <Progress value={c.progress_pct} className="h-1.5" />
              </div>
            </Card>
          </Link>
        ))
      )}
    </div>
  );
}
