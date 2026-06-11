-- Enterprise assessment & AI grading extensions
-- Apply: npm run db:apply-enterprise

-- Extend workspace roles for hiring workflows
DO $$ BEGIN
  ALTER TYPE public.app_role ADD VALUE 'hiring_manager';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE public.app_role ADD VALUE 'ceo';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Immutable assessment snapshots (candidates keep scheduled version)
CREATE TABLE IF NOT EXISTS public.assessment_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
  version_number int NOT NULL,
  title text NOT NULL,
  duration_min int,
  interview_weight_mcq int NOT NULL DEFAULT 40,
  interview_weight_subjective int NOT NULL DEFAULT 60,
  snapshotted_at timestamptz NOT NULL DEFAULT now(),
  snapshotted_by uuid,
  UNIQUE (assessment_id, version_number)
);

CREATE TABLE IF NOT EXISTS public.assessment_version_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES public.assessment_versions(id) ON DELETE CASCADE,
  source_question_id uuid,
  type text NOT NULL,
  topic text,
  difficulty text,
  prompt text NOT NULL,
  options jsonb,
  rubric text,
  correct_answer text,
  position int NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_assessment_versions_assessment
  ON public.assessment_versions(assessment_id, version_number DESC);

-- Session links to frozen assessment + per-attempt question order
ALTER TABLE public.interview_sessions
  ADD COLUMN IF NOT EXISTS assessment_version_id uuid
  REFERENCES public.assessment_versions(id) ON DELETE SET NULL;

ALTER TABLE public.interview_sessions
  ADD COLUMN IF NOT EXISTS question_order jsonb;

-- Immutable AI evaluation history (never update/delete rows)
CREATE TABLE IF NOT EXISTS public.interview_evaluation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.interview_sessions(id) ON DELETE CASCADE,
  run_number int NOT NULL,
  model_provider text,
  model_name text,
  prompt_summary text,
  evaluation_mode text,
  ai_evaluation jsonb NOT NULL,
  weighted_score numeric(5,2),
  recommendation text CHECK (
    recommendation IS NULL OR recommendation IN ('strong_hire', 'hire', 'borderline', 'no_hire')
  ),
  triggered_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, run_number)
);

CREATE INDEX IF NOT EXISTS idx_interview_eval_runs_session
  ON public.interview_evaluation_runs(session_id, created_at DESC);

-- Append-only HR notes (read-only display; no score edits)
CREATE TABLE IF NOT EXISTS public.interview_hr_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.interview_sessions(id) ON DELETE CASCADE,
  author_id uuid,
  author_email text,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- HR flags on questions (does not affect AI score)
CREATE TABLE IF NOT EXISTS public.interview_question_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.interview_sessions(id) ON DELETE CASCADE,
  question_id uuid NOT NULL,
  reason text NOT NULL,
  flagged_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Supporting evidence scores (paper, in-person, verbal) — separate from AI
CREATE TABLE IF NOT EXISTS public.interview_supporting_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.interview_sessions(id) ON DELETE CASCADE,
  score_type text NOT NULL CHECK (score_type IN ('paper_test', 'in_person', 'verbal_interview', 'other')),
  label text NOT NULL,
  score numeric(5,2),
  weight_pct int CHECK (weight_pct IS NULL OR (weight_pct >= 0 AND weight_pct <= 100)),
  notes text,
  evidence jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
