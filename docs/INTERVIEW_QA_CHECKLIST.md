# Alyson Interview Assessment Workflow — Deep QA Checklist

Use this document for HR rollout QA. Scope is **HR / hiring interview assessments only**. Employee training (`/learn`, `/assignments`, `/attempt`) is out of scope except cross-contamination checks.

**Success criteria:** Every step passes with **zero** of the following:

- Broken navigation or dead-end screens
- Data that appears in one place but not another (title, status, score, questions)
- Actions that succeed in UI but fail silently in DB/email
- Status transitions that skip or repeat illegally
- HR seeing candidate data from a different session/test
- Post-schedule test edits changing what was already delivered to a candidate
- Interview tests leaking into trainee assignment flows

**Recommended environment:** Production-like HTTPS URL (e.g. `https://alyson-training-project-fvf6.vercel.app`). Use **two browsers**: HR (logged in as `hiring_manager`) + candidate (**incognito**, no HR session).

Related docs: [HR_ROLLOUT.md](./HR_ROLLOUT.md), [ASSESSMENT_AUDIT_REPORT.md](./ASSESSMENT_AUDIT_REPORT.md), [DEPLOYMENT.md](./DEPLOYMENT.md).

---

## Pre-flight (block all testing if any fail)

- [ ] `APP_BASE_URL` is HTTPS production URL (not localhost)
- [ ] Email cron hits `POST /api/internal/cron/tick` every ~5 min with `CRON_SECRET`
- [ ] SES verified (`training.group@cintara.ai`, region `us-west-2`)
- [ ] DB scripts applied: `db:apply`, `db:apply-interview`, `db:apply-enterprise`, `db:apply-paper-only`, `db:apply-rls`, `db:apply-email-seeds`
- [ ] `DEEPSEEK_API_KEY` or `OPENROUTER_API_KEY` set (AI evaluation)
- [ ] At least one HR user has **`hiring_manager`** role via `/invites`
- [ ] `node scripts/audit-schema.mjs` passes
- [ ] `npm run validate:deploy -- --production` passes

---

## Roles & access matrix

| Actor | Login | Must access | Must NOT access |
|-------|-------|-------------|-----------------|
| Hiring Manager | `@cintara.ai` + invite role | `/interviews`, `/interviews/assessments`, `/assessments/builder?purpose=interview`, `/assessments/{id}/preview`, `/interviews/{sessionId}` | `/invites`, `/users`, `/settings` (unless also admin) |
| CEO | `ceo` role | `/hiring/reports` (read-only) | Schedule, open test, edit tests |
| Trainee | `trainee` role | `/learn` only | `/interviews`, interview magic links as HR |
| Candidate | No login | `/interview/{token}` only | Any admin route |

**Verify:**

- [ ] Hiring manager lands on `/interviews` after sign-in
- [ ] CEO can view reports but sees read-only banner on session manage page
- [ ] Trainee cannot open `/interviews` (blocked or redirected)

---

## Phase A — Create & publish interview test

**Routes:** `/interviews/assessments` → `/assessments/builder?purpose=interview` → `/assessments/{id}/preview`

### A1. Create test (happy path)

1. Go to **Interview tests** → **Create interview test**
2. Generate questions (AI), review, **Validate**, **Save**
3. Confirm test appears on `/interviews/assessments` with status `validated` or `published`
4. Confirm test does **NOT** appear on `/assessments` main list as assignable training test
5. Confirm test does **NOT** appear on `/assignments` for trainee assignment

### A2. Edit title & description

1. Open **Preview** (`/assessments/{id}/preview`)
2. In **Assessment details** panel, change title from generic `Interview assessment` to a specific name (e.g. `Senior Data Engineer — SQL & Python`)
3. Add short description, click **Save changes**
4. Confirm blue preview card updates immediately
5. Refresh page — title/description persist
6. Schedule a new session with this test — candidate waiting room and magic link show **new title**, not old default

**Fail if:** Title editable only in builder, not on preview; or saved title not reflected on candidate `/interview/{token}`

### A3. Question integrity

1. Preview shows correct question count
2. **Show answer key** highlights correct MCQ options
3. No `correct_answer` or rubric visible without toggling answer key
4. Subjective questions show rubric only when answer key on

### A4. Validation gates

- [ ] Cannot schedule a **draft** test (must be validated/published)
- [ ] Cannot schedule a test with **zero questions**
- [ ] Cannot schedule a **training** test from `/interviews` schedule dialog (only `purpose=interview`)

### A5. Duplicate titles (bulk import guard)

1. Create two interview tests with **identical titles**
2. Attempt **Bulk upload** on `/interviews`
3. **Expect:** Import rejected with explicit duplicate-title error — not silent wrong-test mapping

---

## Phase B — Schedule candidate (single)

**Route:** `/interviews` → Schedule interview → `/interviews/{sessionId}`

### B1. Online mode (primary path)

1. Schedule: name, email, job title, **online** test, future date
2. **Expect after save:**
   - Session row on `/interviews` with status `scheduled`
   - Magic link copyable from Manage
   - Invite email queued (check `/notifications` or email inbox after cron)
   - Magic link host = `APP_BASE_URL` (not localhost, not wrong Vercel alias)

### B2. Version snapshot (critical)

1. Schedule candidate for Test v1
2. **Before candidate starts:** Edit questions in builder (add/remove/change prompt)
3. Candidate completes test using **original** questions (snapshotted at schedule)
4. HR **Manage → Submission** shows same questions candidate saw — **not** live edited version

**Fail if:** HR review or candidate test reflects post-schedule edits

### B3. Paper-only mode

1. Schedule with **paper_only**
2. **Expect:** No magic link required for candidate email; HR manages via session page
3. Upload paper photos on **Paper test** tab → **Grade paper test with AI**
4. Status reaches `evaluated` with scores/recommendation

**Fail if:** Paper-only tries to send online invite; or online flow required

### B4. Hybrid mode

1. Schedule hybrid session
2. Candidate completes online portion
3. HR uploads paper component
4. Final evaluation blends online + paper dimensions

---

## Phase C — Candidate journey (magic link)

**Route:** `/interview/{token}` (incognito)

**Status machine (must be strict):**

```
scheduled → (identity confirm) → waiting → (HR opens) → opened → (candidate starts) → in_progress → submitted → evaluating → evaluated
```

### C1. Identity confirmation

1. Open magic link → identity form (name + email)
2. **Wrong email** → clear rejection, cannot proceed
3. **Correct identity** → waiting room

### C2. Proctoring gate

1. Candidate in waiting room **before** HR opens → **no Start test** button
2. HR clicks **Open test** on `/interviews` row
3. Candidate poll (~5s) picks up `opened` → toast “HR has opened your test”
4. **Start test** appears

**Fail if:** Candidate can start without HR open; or HR open has no effect

### C3. Taking the test

1. Title matches HR-edited title from Phase A2
2. Question count matches preview
3. MCQ options selectable; subjective textareas work
4. Timer/UX: no duplicate questions, numbering 1..N continuous
5. Draft answers survive page refresh (local draft + server draft if implemented)

### C4. Submit & evaluation

1. Submit → candidate sees completion state (`submitted` / `evaluating` / `evaluated`)
2. Submit returns **quickly** (<10s) — eval runs in background
3. HR Manage page shows `submitted` then `evaluating` then `evaluated` (poll ~30s)
4. If stuck >2 min: **Run evaluation** button works manually
5. **Double submit** → `alreadySubmitted` behavior, no duplicate attempts

### C5. MCQ grading logic

Test with questions where `correct_answer` is letter (`A`) but UI submits full option text:

- [ ] Score still correct (shared `mcqAnswersMatch` logic)

### C6. Token security

- [ ] Expired token → clear error, no partial access
- [ ] Invalid/garbled token → 404 or safe error
- [ ] Resend invite regenerates token; old link invalidated or clearly expired

---

## Phase D — HR session management

**Route:** `/interviews/{sessionId}`

### D1. Live proctoring

- [ ] Status badge matches list row and candidate state
- [ ] **Resend candidate link** queues email, shows success
- [ ] Proctor notes save and persist on refresh
- [ ] **Preview** link opens `/assessments/{id}/preview` for correct test

### D2. Results review

After `evaluated`:

- [ ] MCQ score visible and matches manual spot-check
- [ ] Hire recommendation present (`strong_hire` / `hire` / `borderline` / `no_hire`)
- [ ] Profile dimensions populated (or clear “pending” if AI failed)
- [ ] Submission Q&A matches snapshotted version
- [ ] Session appears on `/hiring/reports` with same score/title

### D3. AI failure recovery

1. Temporarily break AI key (or simulate)
2. Submit still succeeds → status `submitted`
3. HR sees eval error hint + **Run evaluation** recovers when key restored

---

## Phase E — Bulk import

**Route:** `/interviews` → Bulk upload

1. Download template — **Available tests** sheet lists unique interview tests
2. Import 3 valid rows → 3 sessions created, emails queued (online mode)
3. Import row with bad email → row fails with reason, others succeed
4. Import row with unknown `assessment_title` → row fails clearly
5. Import 200 rows → completes or fails with timeout message (max 200)
6. Pagination: list shows 100/page with Previous/Next if >100 sessions

---

## Phase F — Cross-contamination (must be zero)

These are **automatic fails** if any occur:

| Check | Expected |
|-------|----------|
| Interview test on `/assignments` assign picker | **Absent** |
| Assign interview test to trainee | **Blocked** with clear error |
| Interview session in `/learn/assignments` | **Never** |
| Training assessment schedulable from `/interviews` | **Blocked** |
| Candidate magic link requires `@cintara.ai` login | **No** — public token only |
| HR interview test mixed into `/assessments` training stats | **Filtered out** |

---

## Phase G — Email & notifications

| Event | Template / queue | Delivered? |
|-------|------------------|------------|
| HR invite sign-up | invite flow | |
| Candidate interview invite | `interview_invite` | after cron |
| Resend link | same | |
| Eval complete notify admin | if configured | |

**Verify on `/notifications`:**

- [ ] Queue drains after cron tick
- [ ] Failed sends show error reason (SES bounce, etc.)
- [ ] Links in emails use production `APP_BASE_URL`

---

## Phase H — Regression checklist (known fixed bugs)

Explicitly re-test these — any recurrence is **P0**:

1. **Post-schedule edit** does not change delivered questions (snapshot)
2. **Submit** does not hang until AI completes
3. **Session list** paginated at 100 (not unbounded load)
4. **Bulk import** rejects duplicate test titles
5. **MCQ letter vs full text** grading works
6. **Interview tests** cannot be trainee-assigned

---

## Data consistency audit (per completed session)

For one fully completed online session, record and compare:

| Field | Interview list | Manage page | Candidate page (at submit) | Hiring reports | Email link |
|-------|----------------|-------------|----------------------------|----------------|------------|
| Assessment title | | | | | |
| Candidate name | | | | | |
| Candidate email | | | | | |
| Question count | | | | N/A | N/A |
| Final score | | | N/A | | N/A |
| Status | | | | | N/A |

**All must match** (except N/A cells).

---

## Bug report template

```text
Severity: P0 / P1 / P2
Phase: A–H
Role: HR / Candidate / CEO
Route: exact URL
Steps: 1…n
Expected:
Actual:
Screenshot / network error:
Session ID / assessment ID:
Loose connection type: [data mismatch | wrong route | silent failure | illegal status | cross-flow leak]
```

---

## Sign-off criteria (release gate)

HR interview workflow is **GO** only if:

- [ ] All Phase A–H checks pass
- [ ] Zero P0/P1 open
- [ ] One full online session completed end-to-end on production URL
- [ ] One title edit on preview reflected on candidate screen
- [ ] One bulk import (≥5 rows) succeeds
- [ ] Cross-contamination table: all **pass**
- [ ] CEO can read reports; hiring manager cannot access admin-only routes

---

## Out of scope (do not file as interview bugs)

- Trainee `/learn/assignments` → `/attempt` flow (separate product track)
- Employee assignment reminder emails (Day 0/7/14/30 Lambda)
- Class video upload persistence on Vercel without S3
