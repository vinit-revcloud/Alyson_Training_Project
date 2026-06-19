import type { QueryClient } from "@tanstack/react-query";
import type { ClassStatus, Level } from "@/lib/class-create.validation";
import type { FinalizeClassResult } from "@/lib/class-finalize.functions";
import { finalizeClass, type ClassRow } from "@/lib/classes-api";
import { updateClassStatusFn } from "@/lib/classes.functions";

/** Invalidate caches shared across /classes, /courses, /assessments, and /users. */
export function invalidateClassLifecycleQueries(
  qc: QueryClient,
  opts: { courseId?: string | null; classId?: string } = {},
): void {
  void qc.invalidateQueries({ queryKey: ["courses"] });
  void qc.invalidateQueries({ queryKey: ["classes", "counts"] });
  void qc.invalidateQueries({ queryKey: ["assessments-stats"] });
  void qc.invalidateQueries({ queryKey: ["users-metrics"] });
  void qc.invalidateQueries({ queryKey: ["all-course-departments"] });
  if (opts.courseId) {
    void qc.invalidateQueries({ queryKey: ["course", opts.courseId] });
    void qc.invalidateQueries({ queryKey: ["course-tree", opts.courseId] });
    void qc.invalidateQueries({ queryKey: ["course-departments", opts.courseId] });
  }
  if (opts.classId) {
    void qc.invalidateQueries({ queryKey: ["class", opts.classId] });
    void qc.invalidateQueries({ queryKey: ["class-sections", opts.classId] });
    void qc.invalidateQueries({ queryKey: ["class-assessment", opts.classId] });
    void qc.invalidateQueries({ queryKey: ["class-assessment-seed", opts.classId] });
  }
}

/** Update class status and run finalize (section questions + optional assessment). */
export async function transitionClassStatus(
  classRow: ClassRow,
  status: ClassStatus,
): Promise<FinalizeClassResult | null> {
  await updateClassStatusFn({ data: { classId: classRow.id, status } });

  if (status === "draft" || !classRow.course_id) return null;

  return finalizeClass({
    classId: classRow.id,
    courseId: classRow.course_id,
    audience: classRow.audience,
    status,
    test: {
      difficulty: classRow.test_difficulty as Level,
      mcqCount: classRow.test_mcq_count,
      subjectiveCount: classRow.test_subjective_count,
      passMark: classRow.test_pass_mark,
    },
    generateSectionQuestions: true,
    generateAssessment: status === "published",
  });
}
