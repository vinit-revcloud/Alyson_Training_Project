import {
  getCourseStudyCardsFn,
  listMyAssignmentsFn,
  listMyCoursesFn,
  recordStudyActivityFn,
} from "@/lib/learn.functions";

export interface LearnerAssignment {
  id: string;
  status: string;
  mode: string;
  due_at: string;
  assigned_at: string;
  attempts_used: number;
  max_attempts: number;
  assessment_title: string;
  course_title: string | null;
  pass_mark: number;
}

export interface LearnerCourse {
  id: string;
  title: string;
  description: string | null;
  role: string | null;
  class_count: number;
  progress_pct: number;
}

export async function listMyAssignments(userId: string): Promise<LearnerAssignment[]> {
  return listMyAssignmentsFn({ data: { userId } });
}

export async function listMyCourses(userId: string): Promise<LearnerCourse[]> {
  return listMyCoursesFn({ data: { userId } });
}

export async function recordStudyActivity(input: {
  userId: string;
  courseId: string;
  classId?: string;
  sectionId?: string;
  cardKey: string;
  secondsSpent?: number;
}): Promise<void> {
  await recordStudyActivityFn({ data: input });
}

export interface StudyCard {
  id: string;
  type: "content" | "quiz";
  title: string;
  body: string;
  sectionId?: string;
  classId?: string;
  questions?: Array<{ id: string; prompt: string; options: string[] | null; type: string }>;
}

export async function getCourseStudyCards(courseId: string): Promise<StudyCard[]> {
  return getCourseStudyCardsFn({ data: { courseId } });
}
