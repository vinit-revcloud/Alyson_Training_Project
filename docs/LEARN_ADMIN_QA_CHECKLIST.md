# Alyson Learn / Admin Integration — Deep QA Checklist

Use this document for **employee training** rollout QA: admin course/class creation, S3 assets, learner panel (`/learn`), and trainee assessments (`/learn/assignments` → `/attempt`). HR interview flow is **out of scope** except cross-contamination checks.

**Success criteria:** Every step passes with **zero** of the following:

- Broken navigation or dead-end screens in admin or learner UI
- Data that appears in admin but not in learner panel (or vice versa): titles, sections, documents, progress, scores
- Actions that succeed in UI but fail silently in DB or S3
- Published class content invisible to trainees (wrong course, empty nav, unsigned assets)
- Course/class name confusion (seed shell vs real parent course)
- Interview assessments leaking into trainee assignment flows
- Unsigned or broken document URLs in learner **Resources**

**Recommended environment:** Production-like HTTPS URL (e.g. `https://alyson-training-project-fvf6.vercel.app`). Use **two browsers**:

1. **Trainer/Admin** — class creation, Student mode preview (`/learn` footer toggle)
2. **Trainee** — department set (e.g. `Data Scientist`), incognito or separate profile

**Record each run** in [LEARN_ADMIN_QA_RESULTS.md](./LEARN_ADMIN_QA_RESULTS.md).

Related docs: [SYLLABUS_IMPORT.md](./SYLLABUS_IMPORT.md), [configure-s3-assets.md](../scripts/configure-s3-assets.md), [INTERVIEW_QA_CHECKLIST.md](./INTERVIEW_QA_CHECKLIST.md), [DEPLOYMENT.md](./DEPLOYMENT.md).

---

## Integration map (what must stay connected)

```
Admin: /classes/new  →  S3 (class-documents/videos/transcripts)  →  DB section_assets
Admin: /courses/$id  →  course_departments, is_core_onboarding, publish
Learner: /learn/dashboard + sidebar  ←  getLearnerVisibleCoursesForUser (core ∪ dept ∪ path)
Learner: /learn/guide/$courseId/$sectionId  ←  getSectionContentFn (server-signed asset URLs)
Admin: /assessments assign  →  /learn/assignments  →  /attempt/$assignmentId
```

**Key rules:**

- Learner sidebar shows **course title** (parent course), with **section** links underneath — not class name alone
- Only **published** classes contribute sections to learner nav
- Courses with **zero published sections** must not appear in learner sidebar (empty seed shells)
- Learner nav = **union** of core onboarding + `course_departments` + `learner_path_assignments` (not path-only)
- Documents uploaded at class creation must render in learner **Resources** without "Document unavailable"
- Class `audience` on publish also writes `course_departments` via `syncCourseOnClassStatus`

---

## Pre-flight (block all testing if any fail)

### Environment & infra

- [ ] `APP_BASE_URL` is HTTPS production URL (not `localhost`)
- [ ] `GET /api/health` returns `ok: true`, `s3Reachable: true`, `storage: "s3"` (when using S3)
- [ ] `S3_ASSETS_BUCKET` set on Vercel (e.g. `alyson-training-media`)
- [ ] `S3_ASSETS_REGION` = `us-west-2` (matches bucket region)
- [ ] `S3_ASSETS_PREFIX` identical on Vercel and any local `.env` used for uploads (prefix mismatch → documents missing in learn)
- [ ] AWS IAM allows `s3:PutObject`, `s3:GetObject`, `s3:ListBucket` on the bucket
- [ ] `CRON_SECRET` set (asset URL signing fallback uses it)
- [ ] `DEEPSEEK_API_KEY` or `OPENROUTER_API_KEY` set (finalize / section questions / assessments)

### Database

- [ ] `npm run db:apply`
- [ ] `npm run db:apply-onboarding-seeds` (core course shells)
- [ ] `npm run db:apply-onboarding-learner-v2` (learner panel tables)
- [ ] `npm run db:apply-rls`
- [ ] `node scripts/audit-schema.mjs` passes
- [ ] `npm run validate:deploy -- --production` passes

### Test accounts

- [ ] At least one **trainer** or **admin** (`@cintara.ai`) for class creation
- [ ] At least one **trainee** with `profiles.department` = `Data Scientist` (or your test department)
- [ ] Trainee can sign in and reach `/learn/dashboard`

### Optional sanity SQL (Neon console)

```sql
-- Empty seed shells (should NOT appear in learner nav after fixes)
SELECT c.title, COUNT(s.id) AS published_sections
FROM courses c
LEFT JOIN classes cl ON cl.course_id = c.id AND cl.status = 'published'
LEFT JOIN sections s ON s.class_id = cl.id
WHERE c.status = 'published'
GROUP BY c.id, c.title
HAVING COUNT(s.id) = 0;

-- Trainee department
SELECT email, department FROM profiles p
JOIN users u ON u.id = p.user_id
WHERE email = 'YOUR_TRAINEE@cintara.ai';
```

---

## Roles & access matrix

| Actor | Login | Must access | Must NOT access |
|-------|-------|-------------|-----------------|
| Admin | `admin` role | Full admin + `/learn` in Student mode | — |
| Trainer | `trainer` role | `/classes/new`, `/courses`, `/assessments`, `/learn` Student mode | `/invites`, `/users`, `/settings`, `/notifications` |
| Trainee | `trainee` role | `/learn/dashboard`, `/learn/guide/*`, `/learn/assignments`, `/learn/policies` | Admin console `/`, `/classes/new` |
| Trainer Student mode | trainer + footer toggle | Same learner routes as trainee; sees all published courses **with content** | Creator-only admin routes while on `/learn` |

**Verify:**

- [ ] Trainee sign-in lands on `/learn` (not admin `/`)
- [ ] Trainee cannot open `/` or `/classes/new` (blocked or redirected)
- [ ] Trainer can toggle **Student mode** / **Creator mode** on `/learn` footer
- [ ] Trainer in Student mode can open `/learn/dashboard` and section guides

---

## Phase A — Course & department setup

**Routes:** `/courses` → `/courses/$courseId`

### A1. Course list & status

1. Open `/courses` — published and draft courses visible to trainer
2. Open a course — breadcrumb, class list, department panel load without error
3. Note **course title** (this is what learners see in sidebar, not class name)

### A2. Core onboarding toggle

1. On `/courses/$courseId`, toggle **Core onboarding course**
2. Sign in as trainee → `/learn/dashboard`
3. **Expect:** Course appears under **Common Onboarding** when toggle ON and course has published sections
4. Toggle OFF → refresh learner nav — course moves to **Role-Specific Training** (if still accessible via department/path)

**Fail if:** Toggle has no effect on learner nav grouping

### A3. Department assignment

1. On `/courses/$courseId`, open **Departments** panel
2. Assign `Data Scientist` (and remove/re-add to test persistence)
3. Set trainee `profiles.department` = `Data Scientist`
4. **Expect:** Course visible in trainee sidebar when published + has sections

**Fail if:** Only class-level `audience` is set but course departments panel empty — document which path you used

### A4. Course publish vs class publish

1. Note course `status` (published/draft)
2. Publish a class under the course (Phase B)
3. **Expect:** Publishing a class promotes parent course to `published` when using publish flow

**Fail if:** Class published but course remains draft and learner cannot access sections

### A5. Seed course awareness (regression)

Know your two common AI Builder entries:

| Course title | Typical source | Learner nav |
|--------------|----------------|-------------|
| `How to be an AI Builder` | `db:apply-onboarding-seeds` shell | **Hidden** if 0 published sections |
| `AI Builder Foundations` (or your wizard parent course) | Class wizard / bulk import | **Visible** when classes published |

- [ ] Confirm empty seed does not show as clickable 0% shell with no sections
- [ ] Confirm real content course shows expandable sections

---

## Phase B — Class creation wizard (happy path)

**Route:** `/classes/new` → publish

### B1. Wizard validation

1. Start new class — attempt **Publish** without required fields
2. **Expect:** Validation blocks with clear message (name, parent course, topics, sections, documents, test config)
3. **Save as draft** with minimal fields — succeeds without full media/test

### B2. Parent course selection (critical)

Test **both** paths (separate runs or two classes):

**Path 1 — New parent course name**

1. Enter parent course name `QA Test Course {date}`
2. Complete wizard, publish
3. **Record:** Course title in learner nav = `QA Test Course {date}`

**Path 2 — Existing seed course**

1. Select or type existing seed `How to be an AI Builder`
2. **Expect:** Content attaches to **seed course id** OR creates sibling — record actual course title in nav
3. **Fail if:** Admin shows class but learner looks under wrong course title

### B3. Section media upload

For each of 2+ sections:

1. Add **YouTube / Vimeo link** (video_link)
2. Upload **PDF document** (required by wizard for publish)
3. Upload **transcript** file (.txt or .srt)

On publish:

- [ ] No upload error toast
- [ ] Class appears on `/classes/$classId` with assets listed per section

### B4. S3 verification

Pick one uploaded PDF from section 1:

1. Admin `/classes/$classId` → Documents → download icon opens presigned `https://...s3...amazonaws.com/...`
2. AWS Console → bucket → key pattern:
   `class-documents/{classId}/{sectionId}/{timestamp}-{filename}.pdf`
3. Optional SQL:

```sql
SELECT kind, file_name, storage_bucket, storage_path, external_url
FROM section_assets sa
JOIN sections s ON s.id = sa.section_id
WHERE s.class_id = 'YOUR_CLASS_ID';
```

**Expect:** `storage_bucket` = `class-documents`, `storage_path` set, `external_url` null for uploads

**Fail if:** UI shows document but `storage_path` null; or S3 object missing at key

### B5. Publish & finalize

1. Publish class (status `published`)
2. If AI finalize runs — note section question count + assessment question count toasts
3. **Expect:** Class status `published` on `/classes/$classId`
4. **Expect:** Parent course `published`

### B6. Final test / assessment linkage

1. After publish, open `/assessments` — find assessment tied to class/course
2. Note assessment id and title for Phase G

---

## Phase C — Class editor (post-create)

**Route:** `/classes/$classId`

### C1. Replace document

1. Section → Documents → replace PDF with new file
2. **Expect:** New file name in UI; download works; old S3 object may remain (acceptable) but DB points to new path

### C2. Add video link

1. Add YouTube link to section without video
2. **Expect:** Appears in admin; embed works in learner guide (Phase F)

### C3. Draft ↔ published toggle

1. Set class to **draft**
2. Trainee refreshes `/learn` — sections from this class **disappear** from sidebar
3. Set back to **published** — sections **reappear**

**Fail if:** Draft class sections still visible to trainees

### C4. Delete asset

1. Remove a document from section
2. **Expect:** Gone from admin list; learner guide no longer shows it (or shows unavailable if cached — hard refresh)

### C5. Add section / edit metadata

1. Edit section title and description
2. **Expect:** Changes reflect on `/learn/guide/$courseId/$sectionId` after refresh

---

## Phase D — Bulk import

**Route:** `/courses/$courseId` → **Bulk import** dialog

See [SYLLABUS_IMPORT.md](./SYLLABUS_IMPORT.md).

### D1. Template & import

1. Download Excel template
2. Import 2 classes, 2+ sections each, with:
   - `video_link` (YouTube URL)
   - `document_link` (public HTTPS PDF URL — not Google Drive auth wall)
   - `transcription` link optional
3. **Expect:** Import success toast; classes appear on course page

### D2. Publish imported classes

1. Set each imported class status to **published**
2. **Expect:** Sections appear in learner nav under **this course title**

### D3. Document ingest behavior

For each `document_link`:

- [ ] **Fetchable public URL** → `storage_bucket` + `storage_path` in DB; file in S3
- [ ] **Blocked URL** (Drive login, 403) → `external_url` kept; learner sees external link OR fails gracefully — record behavior

### D4. Legacy external rows (optional)

```bash
npm run assets:ingest-external -- --dry-run
npm run assets:ingest-external
```

- [ ] Dry-run lists rows; live run migrates fetchable URLs to S3

### D5. Import errors

1. Import row with missing `class_order` or empty `title`
2. **Expect:** Row-level error; no partial orphan classes without sections

---

## Phase E — Learner navigation & visibility

**Browsers:** Trainer (Student mode) + Trainee (`Data Scientist` department)

### E1. Sidebar structure

1. Open `/learn/dashboard` — sidebar loads without error
2. **Common Onboarding** and **Role-Specific Training** groups present
3. Expand a course — section links format: `/learn/guide/{courseId}/{sectionId}`
4. **Expect:** Sidebar label = **course title**, section label = **section title**

### E2. AI Builder regression (P0)

1. Locate course with real content (e.g. `AI Builder Foundations`)
2. **Expect:** Multiple sections listed under correct course
3. **Expect:** Empty seed `How to be an AI Builder` **not** listed (or shows "No modules published yet" only if empty course incorrectly included)

### E3. Path assignment union (P0)

For trainee with rows in `learner_path_assignments`:

1. **Expect:** Sidebar still shows **core onboarding** courses (with content)
2. **Expect:** Sidebar still shows **department** courses (with content)
3. **Expect:** Assigned path courses also visible
4. **Fail if:** Only assigned courses appear (path-only nav bug)

### E4. Dashboard consistency

1. Compare **TOTAL MODULES** on dashboard vs sum of sidebar sections (approximate)
2. Open one section — return to dashboard
3. **Expect:** Progress % or "Continue learning" updates
4. **Your learning items** lists modules with correct course subtitle

### E5. Search

1. Use sidebar **Search guides…** with section keyword
2. **Expect:** Filters courses/sections; clearing search restores full tree

### E6. Access denial

1. As trainee, open `/learn/guide/{wrongCourseId}/{sectionId}` (guessed UUID)
2. **Expect:** "Section not available" or forbidden — not admin data leak

---

## Phase F — Section content & S3 documents

**Route:** `/learn/guide/$courseId/$sectionId`

Use the class from Phase B (wizard upload) for primary verification.

### F1. Page load

1. Section title, description, objectives render
2. No infinite loading spinner
3. Breadcrumb / course context matches admin

### F2. Video

1. **video_link** (YouTube) — iframe embed plays
2. Uploaded **video** file (if any) — HTML5 player loads with signed URL

### F3. Documents (critical)

1. Scroll to **Resources**
2. **Expect:** PDF file name matches admin
3. **Expect:** Click opens new tab with presigned S3 URL or signed app proxy
4. **Expect:** PDF **iframe** preview renders (for PDFs)
5. **Fail if:** "Document unavailable. Ask your trainer to re-upload this file."

### F4. Transcripts

1. Transcript panel expands
2. **Expect:** Extracted text in panel OR link to open transcript file

### F5. Network check (devtools)

1. Load section — inspect server function response for assets
2. **Expect:** Each storage-backed asset has usable `url` (https presigned or `/api/assets/...?sig=...`)
3. **Fail if:** Client calls separate sign endpoint and fails (regression — signing should be server-side in `getSectionContentFn`)

### F6. Trainer Student mode parity

1. Same section as trainer in Student mode
2. **Expect:** Same document/video behavior as trainee

---

## Phase G — Assessments & attempts

### G1. Assessment exists

1. From Phase B class — locate assessment on `/assessments`
2. **Expect:** Title relates to class/course; `purpose` = `training` (not `interview`)
3. Preview assessment — question count matches class test config

### G2. Assign to trainee

**Route:** `/assessments` → Assign

1. Select trainee; set due date; assign training assessment from G1
2. **Expect:** Success toast; row on `/assignments` admin metrics

### G3. Trainee assignment list

**Route:** `/learn/assignments`

1. Trainee sees assignment with correct title
2. Status **Open** or **In progress** — not broken error card

### G4. Attempt flow (P0 regression)

**Route:** `/attempt/$assignmentId`

1. Click **Open** from assignments list
2. **Expect:** Questions load — not "Could not load this assignment"
3. Answer MCQ + subjective; submit
4. **Expect:** Score / completion state; return to assignments list updates status

**Fail if:** Blank page, 500, or auth error on attempt load

### G5. Admin metrics

1. `/assignments` admin view — attempt recorded, score visible
2. Trainee cannot see other learners' attempts

### G6. Interview cross-block

1. On `/assessments`, try to assign an **interview** purpose test to trainee
2. **Expect:** Blocked with clear error
3. **Expect:** Interview tests absent from training assign picker

---

## Phase H — Policies & onboarding enrollment

### H1. Policies page

**Route:** `/learn/policies`

1. Lists published policies requiring acknowledgement
2. **Open PDF handbook** — signed URL loads PDF
3. **Fail if:** "PDF link unavailable"

### H2. Acknowledgement

1. Acknowledge required policy
2. `/learn/dashboard` — pending policy banner count decreases

### H3. Onboarding enrollment (optional)

If testing hire → trainee conversion:

1. After `auto_enroll_onboarding`, trainee gains `learner_path_assignments` rows
2. Core + department courses appear per enrollment rules
3. Document course ids assigned

---

## Phase I — Cross-contamination & regression (P0)

These are **automatic fails** if any occur:

| Check | Expected |
|-------|----------|
| Interview test in `/assessments` training assign flow | **Absent or blocked** |
| Interview session in `/learn/assignments` | **Never** |
| Empty seed course in learner nav with 0 sections | **Hidden** |
| Learner nav path-only when user has path assignments | **Must show core + dept too** |
| Document in admin S3 but "Document unavailable" in learn | **Must not happen** |
| `S3_ASSETS_PREFIX` mismatch between upload and read env | **No mismatch** |
| Course title in nav ≠ admin parent course | **Documented** — not silent |
| Unsigned `/api/assets/...` in PDF iframe (403) | **Must not happen** — use signed URL |
| Draft class sections visible to trainee | **Must not happen** |
| `/attempt/$id` fails for valid assignment | **Must not happen** |

### Explicit regression re-test (known fixed bugs)

Any recurrence is **P0**:

1. **Learner nav union** — path assignments do not hide core/department courses
2. **Empty seed shell** — `How to be an AI Builder` with 0 sections hidden from nav
3. **Server-side asset signing** — PDFs in Resources without client sign failure
4. **Attempt load** — pg-backed `attempt.server.ts` path works for trainees
5. **Interview assignment block** — training assign rejects `purpose=interview`
6. **AI Builder Foundations** visible when published; content class name ≠ course title understood

---

## Data consistency audit

### Per published class (admin ↔ learner)

| Field | Admin `/classes/$classId` | DB `classes` | DB `courses.title` | Learner sidebar | Learner guide |
|-------|---------------------------|--------------|--------------------|-----------------|---------------|
| Class name | | | | N/A | Subtitle on guide page |
| Course title | Breadcrumb | | | Sidebar course row | |
| Class status | | | | Sections visible Y/N | |
| Section count | | | | # links under course | |
| Document file names | | `section_assets` | | | Resources list |

**All must match** (except N/A).

### Per section with uploaded PDF

| Field | Admin download URL | S3 key | `section_assets.storage_path` | Learn Resources |
|-------|-------------------|--------|------------------------------|-----------------|
| File name | | | | |
| Reachable | | | | iframe + link |

### Per assignment attempt

| Field | Admin `/assignments` | `/learn/assignments` | `/attempt/$id` | DB score |
|-------|---------------------|----------------------|----------------|----------|
| Assessment title | | | | |
| Trainee | | | | |
| Status | | | | |
| Score | | | N/A | |

---

## Bug report template

```text
Severity: P0 / P1 / P2
Phase: A–I (or Pre-flight / Roles)
Role: Admin / Trainer / Trainee
Route: exact URL
Steps: 1…n
Expected:
Actual:
Screenshot / network error:
Class ID / course ID / section ID / assignment ID:
Loose connection type: [data mismatch | wrong route | silent failure | nav leak | S3/DB drift | course/class name confusion | unsigned asset]
```

---

## Sign-off criteria (release gate)

Training learn/admin integration is **GO** only if:

- [ ] All Phase A–I checks pass (or documented waivers with P2 only)
- [ ] Zero P0/P1 open
- [ ] One **wizard-created** class E2E on production URL: admin publish → trainee sees sections → PDF in Resources
- [ ] One **bulk-imported** class published and visible to correct department
- [ ] One **trainee attempt** completed end-to-end (`/learn/assignments` → `/attempt` → score)
- [ ] Cross-contamination table (Phase I): all **pass**
- [ ] AI Builder regression: real content course visible; empty seed hidden
- [ ] S3 document presigned URL works in admin and learn panel

---

## Out of scope (do not file as learn/admin bugs)

- HR interview workflow (`/interviews`, `/interview/$token`) — use [INTERVIEW_QA_CHECKLIST.md](./INTERVIEW_QA_CHECKLIST.md)
- Employee assignment Day 0/7/14/30 Lambda emails (Step Functions)
- Neon Auth domain gate (`@cintara.ai` only)
- Local dev without `S3_ASSETS_BUCKET` (disk storage — not production parity)
- Google Drive / SharePoint auth-walled `document_link` ingest (manual re-upload expected)

---

## Quick reference — useful commands

```bash
npm run validate:deploy -- --production
node scripts/audit-schema.mjs
npm run assets:test-s3
npm run assets:ingest-external -- --dry-run
npm run courses:promote-published
```

```sql
-- Learner-visible courses with section counts
SELECT c.title, c.is_core_onboarding, COUNT(s.id) AS sections
FROM courses c
JOIN classes cl ON cl.course_id = c.id AND cl.status = 'published'
JOIN sections s ON s.class_id = cl.id
WHERE c.status = 'published'
GROUP BY c.id, c.title, c.is_core_onboarding
ORDER BY c.is_core_onboarding DESC, c.title;
```
