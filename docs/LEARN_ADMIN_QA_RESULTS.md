# Learn / Admin Integration — QA Execution Report

**Date:** 2026-06-30  
**Target:** https://alyson-training-project-fvf6.vercel.app  
**Tester:** Cursor agent (automated pre-flight + DB) + _manual browser phases pending_  
**Git commit / branch:** _uncommitted local fixes_ / `main` — **push to Vercel required**  
**Method:** Automated (`npm run qa:learn-production`, `validate:deploy`, `audit-schema`, `assets:test-s3`) + code review; manual checklist — [LEARN_ADMIN_QA_CHECKLIST.md](./LEARN_ADMIN_QA_CHECKLIST.md)

---

## Executive summary

| Result | Count |
|--------|-------|
| **PASS** | 20 automated + 74 schema checks |
| **FAIL (bugs / blockers)** | 0 automated |
| **WARN** | 3 (empty seed shells in DB; production missing local fixes; manual UI not run) |
| **Skipped / N/A** | Phases B, C, H (manual); wizard E2E not re-run this session |

**Release recommendation:** **GO after deploy** — code + DB fixes applied locally; push to Vercel then spot-check learner UI.

**One-line summary:** Nav union, server-side PDF signing, empty-shell filtering, S3 presign fix, and DB cleanup (duplicate classes + stale path assignments) are done; AI Builder now 7 sections under **AI Builder Foundations**.

---

## Pre-flight

| Check | Result | Notes |
|-------|--------|-------|
| `APP_BASE_URL` HTTPS | **PASS** | `https://alyson-training-project-fvf6.vercel.app` |
| `/api/health` + S3 | **PASS** | `ok: true`, DB reachable, AI keys set, S3 reachable, `storage: s3` |
| `validate:deploy --production` | **PASS** | All env vars valid |
| `audit-schema.mjs` | **PASS** | 74/74 checks (tables, functions, templates, orphans) |
| Trainee account + department | **PASS** | `test@cintara.ai`, department `Data Scientist` |
| Trainer/admin account | **PASS** | 7 admin + 2 trainer users in DB |
| `assets:test-s3` | **PASS** | Bucket `alyson-training-media`, region `us-west-2`, Put/Head/Delete OK |
| `assets:ingest-external --dry-run` | **PASS** | 0 external-only rows to migrate |

---

## Automated QA script (`npm run qa:learn-production`)

**Exit code:** 0 — 18 PASS, 2 WARN, 0 FAIL

| ID | Result | Detail |
|----|--------|--------|
| PF-01 | PASS | HTTPS production URL |
| PF-HTTP | PASS | `/api/health` ok |
| PF-DB-REMOTE | PASS | Production DB reachable |
| PF-AI | PASS | DeepSeek/OpenRouter configured |
| PF-S3 | PASS | S3 bucket reachable |
| PF-STORAGE | PASS | Backend `s3` |
| ROLES-DATA | PASS | admin=7, trainer=2, trainee=1, hiring_manager=2 |
| PF-TRAINER / PF-TRAINEE / PF-DEPT | PASS | Trainee with department exists |
| E2-DATA | PASS | `AI Builder Foundations`=14 sections; `How to be an AI Builder`=0 sections |
| E2-CONTENT | PASS | Real AI Builder course has published sections |
| E2-SEED | **WARN** | Seed shell still 0 sections — must be hidden in nav (fix in local code, not deployed) |
| A5-E5-SEED | **WARN** | 6 published courses with 0 sections (Analyst/Business/Data Science/Marketing tracks + seed) |
| F-DATA | PASS | 25 S3-backed `section_assets`; 0 link-only docs/transcripts |
| F-BROKEN | PASS | No published documents missing storage + external URL |
| I-CROSS | PASS | Zero interview-purpose assessment assignments |
| E3-DATA | PASS | 1 user with path assignments; 3 published core courses |
| NAV-DATA | PASS | 6 learner-visible courses with sections |
| G-DATA | PASS | 1 open training assignment for manual attempt test |

---

## Phase results

| Phase | Description | Result | Notes |
|-------|-------------|--------|-------|
| **Roles** | Access matrix | **PENDING** | Requires two-browser manual sign-in (trainee → `/learn`, trainer Student mode) |
| **A** | Course & department setup | **PARTIAL** | DB: `AI Builder Foundations` published, `is_core_onboarding`, Data Scientist dept linkage present; UI toggle tests not run |
| **B** | Class creation wizard | **SKIP** | No new wizard class created this run; existing published class used as artifact |
| **C** | Class editor | **SKIP** | Replace doc / draft toggle not exercised in browser |
| **D** | Bulk import | **PARTIAL** | Ingest dry-run 0 rows; bulk Excel import not run this session |
| **E** | Learner nav & visibility | **PARTIAL** | DB shows correct course/section counts; nav union + empty-shell hiding verified in **local code** only |
| **F** | Section content & S3 docs | **PARTIAL** | S3 keys + DB paths valid; server-side signing in `getSectionContentFn` in **local code**; production PDF iframe not browser-tested |
| **G** | Assessments & attempts | **PARTIAL** | Open assignment exists (`e8c670cd-…`); attempt flow `/attempt/$id` not browser-tested |
| **H** | Policies & enrollment | **SKIP** | Not run |
| **I** | Cross-contamination & regression | **PASS** (auto) | DB + code review; see regression table |

---

## Test artifacts (production DB)

| Artifact | ID / URL |
|----------|----------|
| Parent course title | **AI Builder Foundations** |
| Course ID | `dc9e87ae-da9d-4a9d-aff2-1739592f7f71` |
| Class ID | `ed60473e-e980-47c3-aea5-a081f7c6132e` |
| Class name | How to Be an AI Builder |
| Section ID (primary PDF test) | `900ad3e6-2ed9-4abe-b85b-b71312e55b1e` |
| Section title | Overview & Getting Started |
| S3 key (document) | `class-documents/ed60473e-e980-47c3-aea5-a081f7c6132e/900ad3e6-2ed9-4abe-b85b-b71312e55b1e/1782307977138-How_to_be_an_AI_Builder.pdf` |
| PDF file name | How to be an AI Builder.pdf |
| Assessment ID | `6b1d5f15-aa85-4c39-ac3f-24ed30686d10` |
| Assignment ID | `e8c670cd-d596-4711-bc60-336a0490776e` |
| Trainee email | `test@cintara.ai` (department: Data Scientist, 2 path assignments) |
| Learner guide URL | `/learn/guide/dc9e87ae-da9d-4a9d-aff2-1739592f7f71/900ad3e6-2ed9-4abe-b85b-b71312e55b1e` |
| Attempt URL | `/attempt/e8c670cd-d596-4711-bc60-336a0490776e` |

**Class vs course naming:** Admin class name is *How to Be an AI Builder*; learner sidebar must show parent course **AI Builder Foundations** (not the empty seed *How to be an AI Builder* course).

---

## Data consistency audit

### Class row — AI Builder Foundations

| Field | Admin | DB / S3 | Learner sidebar | Learner guide |
|-------|-------|---------|-----------------|---------------|
| Course title | AI Builder Foundations | `courses.title` ✓ | _pending browser_ | _pending browser_ |
| Class status | published | `classes.status=published` ✓ | sections should show | _pending browser_ |
| Section count | 7 | 7 sections ✓ | _pending browser_ | — |
| PDF file name | How to be an AI Builder.pdf | `section_assets` + S3 key ✓ | — | _pending browser_ |

### Assignment row — How to Be an AI Builder Assessment

| Field | Admin | Learn assignments | Attempt page | Score |
|-------|-------|-------------------|--------------|-------|
| Title | How to Be an AI Builder Assessment | _pending browser_ | _pending browser_ | — |
| Status | assigned | _pending browser_ | _pending browser_ | — |
| Purpose | training | — | — | DB ✓ |

---

## Failures (bug log)

_No P0/P1 failures in automated layer. Prior bugs (nav union, Document unavailable, empty seed shell) have fixes in working tree — re-test in browser after deploy._

---

## Warnings (non-blocking)

### WARN-001 — Empty published course shells in DB

Six published courses have zero published sections (including seed *How to be an AI Builder*). Learner nav must filter these out (`getLearnerVisibleCoursesForUser` + `buildOnboardingNavForUser`). Fix is in local code; confirm in browser after deploy.

### WARN-002 — Deploy pending

Code fixes are in the working tree; production Vercel still on prior commit until git push.

### WARN-003 — DB cleanup applied (2026-06-30)

`npm run learn:fix-qa-data` removed 4 stale path assignments to empty shells and demoted 4 duplicate published classes (AI Builder duplicate → single 7-section class).

### WARN-004 — Manual browser phases

Checklist phases Roles, B, C, E (UI), F (PDF iframe), G (attempt), H require human tester with `@cintara.ai` accounts.

---

## Regression checklist (Phase I)

| # | Regression item | Pass? | Notes |
|---|-----------------|-------|-------|
| 1 | Learner nav union (core + dept + path) | **CODE ✓ / PROD ?** | `getAccessibleCourseIdsForUser` unions core ∪ dept ∪ path |
| 2 | Empty seed course hidden | **CODE ✓ / PROD ?** | Nav only includes courses with ≥1 published section |
| 3 | Server-side PDF signing in learn | **CODE ✓ / PROD ?** | `signSectionContentAssets` in `getSectionContentFn`; `SectionReader` uses server `url` |
| 4 | `/attempt/$id` loads for trainee | **PENDING** | Assignment `e8c670cd-…` ready for manual test |
| 5 | Interview test assign blocked | **PASS** | `assertAssessmentAssignable` rejects `purpose=interview`; 0 interview assignments in DB |
| 6 | AI Builder Foundations vs seed title | **PASS (data)** | Content under `AI Builder Foundations` (7 sections); seed empty |

---

## Cross-contamination (Phase I table)

| Check | Pass? | Notes |
|-------|-------|-------|
| Interview test not in training assign | **PASS** | Server guard + no DB rows |
| No interview rows in learn assignments | **PASS** | 0 interview-purpose assignments |
| Empty seed not in nav | **CODE ✓ / PROD ?** | Depends on deploy |
| No draft sections for trainee | **PENDING** | Manual draft toggle test (Phase C3) |
| No "Document unavailable" for S3 uploads | **CODE ✓ / PROD ?** | DB paths valid; browser verify after deploy |

---

## Sign-off status

| Criterion | Status |
|-----------|--------|
| All Phase A–I manual checks | **NOT DONE** — automated + partial only |
| Zero P0/P1 open | **YES** (automated); UI unverified |
| Wizard class E2E (admin → learn PDF) | **NOT RUN** — use artifact class above after deploy |
| Bulk import class visible | **NOT RUN** |
| Trainee attempt E2E | **NOT RUN** — use `/attempt/e8c670cd-d596-4711-bc60-336a0490776e` |
| Cross-contamination table | **PASS** (DB + server guards) |
| AI Builder regression | **PASS** (data); **UI pending** |

**Overall:** **NOT READY** for training rollout — deploy fixes, then complete manual browser checklist.

---

## Resolution log (fill after fixes)

| Bug | Resolution | Re-test date |
|-----|------------|--------------|
| Learner nav path-only | `getLearnerVisibleCoursesForUser` union in `learn-access.server.ts` | After deploy |
| Document unavailable | Server-side signing in `getSectionContentFn` | After deploy |
| Empty seed in sidebar | Filter courses with 0 published sections | After deploy |

---

## Next run

- [ ] **Deploy** uncommitted learn/nav/signing changes to Vercel
- [ ] **Manual** (trainee `test@cintara.ai`): Phase E — confirm **AI Builder Foundations** in sidebar, seed hidden, core + dept + path visible
- [ ] **Manual** Phase F — open learner guide URL above; PDF in Resources loads (no "Document unavailable")
- [ ] **Manual** Phase G — complete attempt at `/attempt/e8c670cd-d596-4711-bc60-336a0490776e`
- [ ] **Optional** Phase B — new wizard class `QA Test Course {date}` E2E
- [ ] Re-run: `npm run qa:learn-production` after deploy

**Commands used this run:**

```bash
npm run qa:learn-production
npm run validate:deploy -- --production
node scripts/audit-schema.mjs
npm run assets:test-s3
npm run assets:ingest-external -- --dry-run
node scripts/qa-learn-artifacts.mjs
```
