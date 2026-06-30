# Interview QA Execution Report

**Date:** 2026-06-30  
**Target:** `https://alyson-training-project-fvf6.vercel.app`  
**Method:** Automated pre-flight + DB checks (`scripts/qa-interview-production.mjs`, `audit-schema.mjs`, `validate:deploy --production`). Browser/manual phases **not executed** in this run (requires HR + incognito candidate sessions).

---

## Executive summary

| Result | Count |
|--------|-------|
| **Automated PASS** | 14 |
| **FAIL (bugs / blockers)** | 2 |
| **WARN** | 3 |
| **Manual phases pending** | A–E browser flows, role UX, full candidate journey |

**Release recommendation:** **NO-GO** for HR-only rollout until duplicate test titles are resolved and hiring_manager invites are issued (or HR rollout doc updated to confirm admin/trainer accounts are intentional).

---

## Pre-flight (automated)

| Check | Result |
|-------|--------|
| `APP_BASE_URL` HTTPS production | PASS |
| Production `/api/health` | PASS |
| Production DB reachable | PASS |
| Neon Auth JWKS | PASS |
| AI keys on production | PASS |
| SES configured on production | PASS |
| S3 reachable on production | PASS |
| Cron tick `POST /api/internal/cron/tick` | PASS |
| `audit-schema.mjs` (74 checks) | PASS |
| `validate:deploy --production` | PASS |
| `interview_invite` email template | PASS |
| Cross-contamination (interview → trainee assignments) | PASS (0 rows) |

---

## Failures (bug template)

### BUG-001 — No `hiring_manager` users in production DB

```text
Severity: P1
Phase: Pre-flight / Roles
Role: HR
Route: /invites → sign-in → /interviews
Steps:
  1. Query user_roles for hiring_manager
  2. Compare with HR_ROLLOUT.md requirement
Expected:
  At least one user with hiring_manager role for dedicated HR access
Actual:
  Roles in DB: admin=7, trainer=2, trainee=1, hiring_manager=0
Loose connection type: operational / access config mismatch
```

**Note:** `admin` and `trainer` can still access `/interviews` per `content-manager.server.ts`. If HR uses `admin@cintara.ai`, workflow may work but violates the dedicated HR role model in `HR_ROLLOUT.md`.

**Fix:** Invite HR users with role **Hiring Manager** from `/invites`, or document that trainers/admins are the interim HR operators.

---

### BUG-002 — Duplicate interview assessment titles block bulk import

```text
Severity: P1
Phase: A5 / E
Role: HR
Route: /interviews → Bulk upload
Steps:
  1. Query assessments WHERE purpose='interview' GROUP BY title HAVING count>1
Expected:
  Unique titles per interview test (bulk import maps by title)
Actual:
  Title "Interview · Data Scientist" appears 5 times (5 separate assessment IDs)
Loose connection type: data integrity — bulk import will reject or fail ambiguous mapping
```

**Fix:** Rename 4 duplicate tests in Interview tests / builder to unique titles (e.g. role + version + date). Keep one canonical test per role.

---

## Warnings (not release blockers alone)

### WARN-001 — Email queue backlog

```text
Severity: P2
Phase: G
Pending emails in email_queue (archived_at IS NULL): 21
```

Cron endpoint works; backlog may indicate slow drain or historical queue. Verify `/notifications` after cron tick and confirm candidate invites deliver.

---

### WARN-002 — Legacy sessions without version snapshot

```text
Severity: P2
Phase: B2
Sessions missing assessment_version_id (active/non-cancelled): 2
  - d71d9253… evaluated — Aman Gupta (2026-06-09)
  - 2b5c0b81… evaluated — Priya Sharma (2026-06-08)
```

Pre-fix legacy data. **New schedules** should snapshot via `snapshotAssessmentVersion` — verify on next schedule manually.

---

### WARN-003 — Invalid token HTTP response

```text
Severity: P2
Phase: C6
GET /interview/00000000-0000-0000-0000-000000000000 returns HTTP 200 (SPA shell)
```

Server-side rejection happens after client load. **Manual verify:** invalid token shows error in UI, not a blank test.

---

## Manual phases — NOT RUN (requires human QA)

The following checklist sections were **not executed** in this automated run. Complete in browser before sign-off:

| Phase | Items | Why skipped |
|-------|-------|-------------|
| **Roles UX** | HM landing, CEO read-only, trainee blocked | Needs authenticated sessions per role |
| **A1–A4** | Create test, title edit on preview, question integrity | Needs builder + preview UI |
| **B1–B4** | Schedule online/paper/hybrid, snapshot behavior | Needs HR + candidate browsers |
| **C1–C6** | Identity, proctor gate, submit, MCQ grading, tokens | Needs live magic link |
| **D1–D3** | Manage session, results, AI recovery | Needs completed session |
| **E** | Bulk import 3+ rows | Blocked by BUG-002 until titles unique |
| **F** | UI cross-contamination | Partially covered by DB; UI assign picker not checked |
| **H** | Regression re-test | Needs manual end-to-end |

---

## Data snapshot (production DB)

- **Interview tests (schedulable):** 8 validated/published  
- **Sessions:** evaluated=5, scheduled=1  
- **Trainee assignments on interview tests:** 0  
- **Roles:** admin 7, trainer 2, trainee 1, hiring_manager 0  

---

## Re-run automated QA

```bash
node scripts/audit-schema.mjs
npm run validate:deploy -- --production
node scripts/qa-interview-production.mjs
```

---

## Sign-off status

| Criterion | Status |
|-----------|--------|
| All Phase A–H manual checks | **Pending** |
| Zero P0/P1 open | **FAIL** (2 P1) |
| Full online session E2E on production | **Pending** |
| Title edit on preview → candidate screen | **Pending** (deploy local preview changes first) |
| Bulk import ≥5 rows | **Blocked** (BUG-002) |
| Cross-contamination | **PASS** (automated) |

**Overall: NOT READY for HR-only production sign-off.**

---

## Resolution (2026-06-30)

Automated fixes applied via `npm run fix:interview-qa` + code changes:

| Issue | Resolution |
|-------|------------|
| BUG-001 | Granted `hiring_manager` to trainer users (`admin@cintara.ai`, `training.group@cintara.ai`) |
| BUG-002 | Renamed 4 duplicate titles to `(2)`–`(5)`; kept canonical test with 3 sessions |
| Root cause (re-save created new rows) | Interview saves now **update** when `assessmentId` is passed; unique title enforced on save |
| Prevention | Default interview title includes role + date; duplicate copy gets unique suffix |

Re-run `npm run qa:interview-production` — **exit 0**, 0 failures.

Remaining warnings (non-blocking): 2 legacy evaluated sessions without version snapshot; invalid token returns SPA shell (UI still shows error after load).
