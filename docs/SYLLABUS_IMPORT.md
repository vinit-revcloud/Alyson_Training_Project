# Syllabus import — Excel to courses / sections / assets

Use the admin **Bulk import** dialog on a course page (`/courses/$courseId`) to load onboarding content from Excel.

## Workbook format

### Option A — Two sheets (recommended)

**Sheet `Classes`**

| Column | Aliases | Required |
|--------|---------|----------|
| `class_order` | `order`, `#` | Yes |
| `name` | `class_name`, `class` | Yes |
| `summary` | `description` | No |
| `level` | | No (default Beginner) |
| `status` | | No (default draft → set `published` before go-live) |

**Sheet `Sections`**

| Column | Aliases | Maps to |
|--------|---------|---------|
| `class_order` | `class order`, `class #` | Parent class |
| `order` | `section_order`, `#` | Section position |
| `title` | `section_title`, `section`, `topic` | Section title |
| `description` | `section_description` | Section body |
| `objectives` | `learning_objectives` | Objectives block |
| `duration_min` | `duration`, `duration minutes` | Metadata (in import) |
| `video_link` | `video url`, `video` | `section_assets` kind `video_link` |
| `document_link` | `document url`, `documents` | `section_assets` kind `document` |
| `transcription` | `transcript`, `transcript_link` | `section_assets` kind `transcript` |

### Option B — Flat sheet

One row per section; include `class_order`, `class_name`, and section columns on each row.

## Core onboarding courses

1. Create or open course **How to be an AI Builder**
2. Enable **Core onboarding course** on the course page (or run `npm run db:apply-onboarding-seeds`)
3. Bulk import classes/sections; publish all classes
4. Repeat for **Business Process**

## Role-specific tracks

1. Create a course per department track (e.g. Data Scientist onboarding)
2. Assign departments via **Departments** panel on the course page (`course_departments`)
3. Bulk import syllabus; publish
4. On hire, `auto_enroll_onboarding()` assigns core + department courses and creates `learner_path_assignments`

## Assessments

Each class row can include test columns (`test_mcq_count`, `test_pass_mark`, etc.). Bulk import creates a primary assessment per class. On enrollment, `auto_assign_course()` creates `assessment_assignments` for learners.

## Admin checklist

1. `npm run db:apply-onboarding-seeds` (core course shells)
2. Import syllabus Excel per course
3. Publish classes
4. Mark core courses with **Core onboarding** toggle
5. Link role tracks to departments
6. Verify learner nav at `/learn/dashboard` after test candidate bootstrap
