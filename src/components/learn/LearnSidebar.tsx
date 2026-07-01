import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { getOnboardingNavFn } from "@/lib/onboarding/onboarding.functions";
import type { OnboardingNavCourse } from "@/lib/onboarding/onboarding-nav.server";

function filterCourses(courses: OnboardingNavCourse[], q: string): OnboardingNavCourse[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return courses;
  return courses
    .map((c) => ({
      ...c,
      sections: c.sections.filter(
        (s) =>
          s.title.toLowerCase().includes(needle) || c.title.toLowerCase().includes(needle),
      ),
    }))
    .filter((c) => c.sections.length > 0 || c.title.toLowerCase().includes(needle));
}

function NavGroup({
  title,
  courses,
  defaultOpen,
}: {
  title: string;
  courses: OnboardingNavCourse[];
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? true);
  if (!courses.length) return null;
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {title}
      </button>
      {open ? (
        <ul className="mt-1 space-y-0.5">
          {courses.map((course) => (
            <CourseNav key={course.id} course={course} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function CourseNav({ course }: { course: OnboardingNavCourse }) {
  const [open, setOpen] = useState(true);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1 rounded-md px-2 py-1 text-left text-xs font-medium hover:bg-[var(--learn-card)]"
      >
        {open ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
        <span className="truncate">{course.title}</span>
        <span className="ml-auto text-[10px] text-muted-foreground">{course.progressPct}%</span>
      </button>
      {open ? (
        <ul className="ml-4 border-l border-[var(--learn-border)] pl-2">
          {course.sections.length === 0 ? (
            <li className="px-2 py-1 text-[10px] text-muted-foreground">No modules published yet</li>
          ) : null}
          {course.sections.map((sec) => {
            const href = `/learn/guide/${sec.courseId}/${sec.id}`;
            const active = pathname === href;
            return (
              <li key={sec.id}>
                <Link
                  to="/learn/guide/$courseId/$sectionId"
                  params={{ courseId: sec.courseId, sectionId: sec.id }}
                  className={cn(
                    "block truncate rounded-md px-2 py-1 text-xs",
                    active
                      ? "bg-[var(--learn-card)] font-medium text-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-[var(--learn-card)]/80 hover:text-foreground",
                  )}
                >
                  {sec.completed ? "✓ " : ""}
                  {sec.title}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </li>
  );
}

export function LearnSidebarNav() {
  const [search, setSearch] = useState("");
  const loadNav = useServerFn(getOnboardingNavFn);
  const { data, isLoading } = useQuery({
    queryKey: ["onboarding-nav"],
    queryFn: () => loadNav(),
  });

  const core = useMemo(
    () => filterCourses(data?.coreCourses ?? [], search),
    [data?.coreCourses, search],
  );
  const role = useMemo(
    () => filterCourses(data?.roleCourses ?? [], search),
    [data?.roleCourses, search],
  );

  if (isLoading) {
    return <p className="px-2 py-4 text-xs text-muted-foreground">Loading guides…</p>;
  }

  return (
    <>
      <div className="border-b border-[var(--learn-border)] p-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search guides…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 border-[var(--learn-border)] bg-[var(--learn-card)] pl-8 text-xs"
          />
        </div>
      </div>
      <nav className="flex-1 space-y-3 overflow-y-auto p-2 text-sm">
        <NavGroup title="Common Onboarding" courses={core} defaultOpen />
        <NavGroup title="Role-Specific Training" courses={role} defaultOpen />
        {!core.length && !role.length ? (
          <p className="px-2 text-xs text-muted-foreground">No guides match your search.</p>
        ) : null}
      </nav>
    </>
  );
}
