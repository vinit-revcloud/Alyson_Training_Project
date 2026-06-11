/** Canonical department labels — must match `public.departments` seed and `course_departments.department`. */
export const DEPARTMENTS = [
  "Data Scientist",
  "Product Manager",
  "Marketing",
  "Engineer",
  "Analyst",
  "Affiliate",
  "HR",
  "Operations",
  "Sales",
] as const;

export type DepartmentLabel = (typeof DEPARTMENTS)[number];
