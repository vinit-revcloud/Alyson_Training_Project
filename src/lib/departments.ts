/** Canonical department labels — must match `public.departments` seed and `course_departments.department`. */
export const DEPARTMENTS = [
  "Data Scientist",
  "Product Manager",
  "Marketing",
  "Engineer",
  "Analyst",
  "Affiliate",
  "Affiliate Manager",
  "Data Architect",
  "Data Engineer",
  "HR",
  "Operations",
  "Sales",
] as const;

/** Map hiring target role labels to department for onboarding tracks. */
export const HIRING_ROLE_TO_DEPARTMENT: Record<string, DepartmentLabel> = {
  "Data Scientist + AI Builder": "Data Scientist",
  "Analyst + AI Builder": "Analyst",
  "Data Architect": "Data Architect",
  "Data Engineer": "Data Engineer",
  Affiliate: "Affiliate",
  "Affiliate Manager": "Affiliate Manager",
  "Senior Manager": "Affiliate Manager",
  "Marketing Analyst": "Marketing",
  "Project Manager": "Product Manager",
  "Talent Recruiter": "HR",
};

export type DepartmentLabel = (typeof DEPARTMENTS)[number];
