import {
  getAllCourseDepartmentsFn,
  getCourseDepartmentsFn,
  getCourseTreeFn,
  listUsersForAssignmentFn,
  moveSectionToClassFn,
  reorderClassesFn,
  reorderSectionsFn,
  setCourseDepartmentsFn,
  updateUserDepartmentFn,
} from "@/lib/assignments.functions";
import { DEPARTMENTS, type DepartmentLabel } from "@/lib/departments";

export { DEPARTMENTS };
export type Department = DepartmentLabel | string;

export interface UserRow {
  user_id: string;
  display_name: string | null;
  email: string | null;
  department: string | null;
  roles: string[];
  assigned_courses: number;
}

export interface CourseDepartmentRow {
  id: string;
  course_id: string;
  department: string;
}

export async function getCourseDepartments(courseId: string): Promise<string[]> {
  return getCourseDepartmentsFn({ data: { courseId } });
}

export async function getAllCourseDepartments(): Promise<Map<string, string[]>> {
  const record = await getAllCourseDepartmentsFn();
  return new Map(Object.entries(record));
}

export async function setCourseDepartments(
  courseId: string,
  departments: string[],
): Promise<void> {
  await setCourseDepartmentsFn({ data: { courseId, departments } });
}

export async function listUsersWithAssignments(): Promise<UserRow[]> {
  return listUsersForAssignmentFn();
}

export async function updateUserDepartment(
  userId: string,
  department: string | null,
): Promise<void> {
  await updateUserDepartmentFn({ data: { userId, department } });
}

export async function reorderClasses(courseId: string, classIds: string[]): Promise<void> {
  await reorderClassesFn({ data: { courseId, classIds } });
}

export async function reorderSections(classId: string, sectionIds: string[]): Promise<void> {
  await reorderSectionsFn({ data: { classId, sectionIds } });
}

export async function moveSectionToClass(
  sectionId: string,
  targetClassId: string,
  position: number,
): Promise<void> {
  await moveSectionToClassFn({ data: { sectionId, targetClassId, position } });
}

export interface CourseTreeSection {
  id: string;
  title: string;
  position: number;
  asset_count: number;
  question_count: number;
}
export interface CourseTreeClass {
  id: string;
  name: string;
  status: string;
  position: number;
  level: string;
  sections: CourseTreeSection[];
}

export async function getCourseTree(courseId: string): Promise<CourseTreeClass[]> {
  return getCourseTreeFn({ data: { courseId } });
}
