import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  FileText,
  PlayCircle,
  GraduationCap,
  Users,
  ClipboardCheck,
  BarChart3,
  Settings,
  LayoutDashboard,
  PlusSquare,
  Mail,
  Video,
} from "lucide-react";

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  badge?: string;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", to: "/", icon: LayoutDashboard },
  { label: "Create Class", to: "/classes/new", icon: PlusSquare },
  { label: "Courses", to: "/courses", icon: GraduationCap },
  { label: "Users", to: "/users", icon: Users },
  { label: "Invites", to: "/invites", icon: Mail },
  { label: "Assessments", to: "/assessments", icon: ClipboardCheck },
  { label: "Interviews", to: "/interviews", icon: Video },
  { label: "Interview Tests", to: "/interviews/assessments", icon: ClipboardCheck },
  { label: "Hiring Reports", to: "/hiring/reports", icon: BarChart3 },
  { label: "Test Templates", to: "/assessments/templates", icon: FileText },
  { label: "Assignments", to: "/assignments", icon: FileText },
  { label: "Analytics", to: "/analytics", icon: BarChart3 },
  { label: "Executive", to: "/executive", icon: BarChart3 },
  { label: "Notifications", to: "/notifications", icon: Mail },
  { label: "Email Templates", to: "/notifications/templates", icon: Mail },
  { label: "Email Testing", to: "/email-testing", icon: Mail },
  { label: "Settings", to: "/settings", icon: Settings },
];


export type Role = "Data Scientist" | "Product Manager" | "Marketing" | "Engineer" | "Analyst";

export interface Section {
  id: string;
  title: string;
  videoTitle?: string;
  videoDuration?: string;
  transcriptStatus: "pending" | "ready" | "blog-generated";
  documents: { name: string; size: string }[];
}

export interface CourseClass {
  id: string;
  title: string;
  sections: Section[];
}

export interface Course {
  id: string;
  title: string;
  description: string;
  role: Role;
  level: "Beginner" | "Intermediate" | "Advanced";
  cover: string; // tailwind gradient class
  icon: LucideIcon;
  enrolled: number;
  completion: number;
  topics: string[];
  classes: CourseClass[];
  status: "draft" | "published";
  updatedAt: string;
}

export const COURSES: Course[] = [
  {
    id: "ds-101",
    title: "Data Science Foundations",
    description: "Statistics, Python, and the ML lifecycle from first principles.",
    role: "Data Scientist",
    level: "Beginner",
    cover: "from-blue-500 to-indigo-600",
    icon: BookOpen,
    enrolled: 86,
    completion: 72,
    topics: ["Statistics", "Python", "SQL", "ML Basics", "EDA"],
    status: "published",
    updatedAt: "2026-05-28",
    classes: [
      {
        id: "cls-1",
        title: "Class One — Foundations",
        sections: [
          {
            id: "sec-1",
            title: "Introduction to Statistics",
            videoTitle: "stats-intro.mp4",
            videoDuration: "18:42",
            transcriptStatus: "blog-generated",
            documents: [
              { name: "stats-handbook.pdf", size: "2.4 MB" },
              { name: "exercises.pdf", size: "612 KB" },
            ],
          },
          {
            id: "sec-2",
            title: "Python for Data Analysis",
            videoTitle: "pandas-deep-dive.mp4",
            videoDuration: "24:10",
            transcriptStatus: "ready",
            documents: [{ name: "pandas-cheatsheet.pdf", size: "1.1 MB" }],
          },
        ],
      },
    ],
  },
  {
    id: "ml-201",
    title: "Applied Machine Learning",
    description: "Build, evaluate and ship classical ML systems end-to-end.",
    role: "Data Scientist",
    level: "Intermediate",
    cover: "from-violet-500 to-purple-600",
    icon: PlayCircle,
    enrolled: 54,
    completion: 48,
    topics: ["Regression", "Trees", "Ensembles", "Evaluation"],
    status: "published",
    updatedAt: "2026-05-21",
    classes: [
      {
        id: "cls-1",
        title: "Class One — Supervised Learning",
        sections: [
          {
            id: "sec-1",
            title: "Linear & Logistic Regression",
            videoTitle: "regression.mp4",
            videoDuration: "32:05",
            transcriptStatus: "ready",
            documents: [{ name: "regression-notes.pdf", size: "1.8 MB" }],
          },
        ],
      },
    ],
  },
  {
    id: "pm-101",
    title: "Product Discovery Essentials",
    description: "From customer interviews to opportunity solution trees.",
    role: "Product Manager",
    level: "Beginner",
    cover: "from-emerald-500 to-teal-600",
    icon: FileText,
    enrolled: 41,
    completion: 65,
    topics: ["Discovery", "Interviews", "OST", "Prioritization"],
    status: "draft",
    updatedAt: "2026-05-30",
    classes: [
      {
        id: "cls-1",
        title: "Class One — Talking to Users",
        sections: [
          {
            id: "sec-1",
            title: "Running Discovery Interviews",
            videoTitle: "interviews.mp4",
            videoDuration: "21:30",
            transcriptStatus: "pending",
            documents: [],
          },
        ],
      },
    ],
  },
  {
    id: "mkt-101",
    title: "Performance Marketing 101",
    description: "Channel strategy, attribution and creative testing.",
    role: "Marketing",
    level: "Beginner",
    cover: "from-orange-500 to-pink-600",
    icon: BarChart3,
    enrolled: 67,
    completion: 81,
    topics: ["Channels", "Attribution", "Creative"],
    status: "published",
    updatedAt: "2026-05-18",
    classes: [],
  },
];

export interface UserRow {
  id: string;
  name: string;
  email: string;
  role: Role;
  department: string;
  courses: number;
  progress: number;
  status: "Active" | "At risk" | "Completed";
}

export const USERS: UserRow[] = [
  { id: "u1", name: "Amelia Chen", email: "amelia.chen@alyson.io", role: "Data Scientist", department: "Insights", courses: 3, progress: 82, status: "Active" },
  { id: "u2", name: "Marcus Patel", email: "marcus.patel@alyson.io", role: "Data Scientist", department: "Insights", courses: 2, progress: 45, status: "At risk" },
  { id: "u3", name: "Sofia Rivera", email: "sofia.rivera@alyson.io", role: "Product Manager", department: "Product", courses: 4, progress: 100, status: "Completed" },
  { id: "u4", name: "Daniel Kim", email: "daniel.kim@alyson.io", role: "Marketing", department: "Growth", courses: 2, progress: 67, status: "Active" },
  { id: "u5", name: "Priya Shah", email: "priya.shah@alyson.io", role: "Engineer", department: "Platform", courses: 1, progress: 29, status: "At risk" },
  { id: "u6", name: "Liam O'Connor", email: "liam.oconnor@alyson.io", role: "Analyst", department: "Finance", courses: 3, progress: 91, status: "Active" },
  { id: "u7", name: "Yuki Tanaka", email: "yuki.tanaka@alyson.io", role: "Data Scientist", department: "Insights", courses: 2, progress: 73, status: "Active" },
];

export interface AssessmentRow {
  id: string;
  title: string;
  course: string;
  role: Role;
  questions: number;
  attempts: number;
  passRate: number;
  retests: number;
  status: "Draft" | "In review" | "Published";
  updatedAt: string;
}

export const ASSESSMENTS: AssessmentRow[] = [
  { id: "a1", title: "DS Foundations · Final Test", course: "Data Science Foundations", role: "Data Scientist", questions: 24, attempts: 86, passRate: 78, retests: 9, status: "Published", updatedAt: "2026-05-28" },
  { id: "a2", title: "Applied ML · Module 1 Check", course: "Applied Machine Learning", role: "Data Scientist", questions: 18, attempts: 54, passRate: 64, retests: 14, status: "Published", updatedAt: "2026-05-22" },
  { id: "a3", title: "Discovery Interviews · Quiz", course: "Product Discovery Essentials", role: "Product Manager", questions: 12, attempts: 41, passRate: 89, retests: 3, status: "In review", updatedAt: "2026-05-31" },
  { id: "a4", title: "Attribution Models · Final", course: "Performance Marketing 101", role: "Marketing", questions: 20, attempts: 67, passRate: 71, retests: 11, status: "Draft", updatedAt: "2026-06-01" },
];

export const LEARNER_TREND = [
  { day: "Mon", active: 124, completed: 18 },
  { day: "Tue", active: 142, completed: 22 },
  { day: "Wed", active: 168, completed: 31 },
  { day: "Thu", active: 155, completed: 27 },
  { day: "Fri", active: 188, completed: 39 },
  { day: "Sat", active: 96, completed: 14 },
  { day: "Sun", active: 78, completed: 11 },
];

export const ROLE_DISTRIBUTION = [
  { role: "Data Scientist", learners: 86 },
  { role: "Product Mgr", learners: 41 },
  { role: "Marketing", learners: 67 },
  { role: "Engineer", learners: 32 },
  { role: "Analyst", learners: 22 },
];
