-- Hiring pipeline & onboarding journey
-- Apply: npm run db:apply-pipeline

-- New workspace role for trial-stage candidates
DO $$ BEGIN
  ALTER TYPE public.app_role ADD VALUE 'candidate';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Core onboarding flag on courses
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS is_core_onboarding boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_courses_core_onboarding
  ON public.courses (is_core_onboarding) WHERE is_core_onboarding = true;

-- Link invites to hiring pipeline
ALTER TABLE public.invites
  ADD COLUMN IF NOT EXISTS pipeline_id uuid;

-- Interview session round linkage
ALTER TABLE public.interview_sessions
  ADD COLUMN IF NOT EXISTS pipeline_id uuid,
  ADD COLUMN IF NOT EXISTS round_type text;

DO $$ BEGIN
  ALTER TABLE public.interview_sessions
    ADD CONSTRAINT interview_sessions_round_type_check
    CHECK (round_type IS NULL OR round_type IN ('tech_round_1', 'tech_round_2', 'ceo_interview'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============ HIRING PIPELINES ============
CREATE TABLE IF NOT EXISTS public.hiring_pipelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  user_id uuid,
  target_role text NOT NULL,
  target_department text NOT NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'hired', 'rejected', 'withdrawn')),
  current_stage text NOT NULL DEFAULT 'tech_round_1'
    CHECK (current_stage IN (
      'tech_round_1', 'tech_round_2', 'trial_project', 'bill_review',
      'ceo_interview', 'onboarding', 'completed'
    )),
  hired_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hiring_pipelines_candidate ON public.hiring_pipelines (candidate_id);
CREATE INDEX IF NOT EXISTS idx_hiring_pipelines_user ON public.hiring_pipelines (user_id);
CREATE INDEX IF NOT EXISTS idx_hiring_pipelines_status ON public.hiring_pipelines (status);
CREATE INDEX IF NOT EXISTS idx_hiring_pipelines_stage ON public.hiring_pipelines (current_stage);

-- FK from invites after hiring_pipelines exists
DO $$ BEGIN
  ALTER TABLE public.invites
    ADD CONSTRAINT invites_pipeline_id_fkey
    FOREIGN KEY (pipeline_id) REFERENCES public.hiring_pipelines(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.interview_sessions
    ADD CONSTRAINT interview_sessions_pipeline_id_fkey
    FOREIGN KEY (pipeline_id) REFERENCES public.hiring_pipelines(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============ TRIAL PROJECTS ============
CREATE TABLE IF NOT EXISTS public.trial_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id uuid NOT NULL UNIQUE REFERENCES public.hiring_pipelines(id) ON DELETE CASCADE,
  title text NOT NULL,
  brief text,
  team_context text,
  estimated_hours int NOT NULL DEFAULT 20,
  platform_access jsonb NOT NULL DEFAULT '[]'::jsonb,
  due_at timestamptz,
  submitted_at timestamptz,
  submission_notes text,
  bill_review_status text NOT NULL DEFAULT 'pending'
    CHECK (bill_review_status IN ('pending', 'scheduled', 'passed', 'failed')),
  bill_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============ PIPELINE STAGES ============
CREATE TABLE IF NOT EXISTS public.pipeline_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id uuid NOT NULL REFERENCES public.hiring_pipelines(id) ON DELETE CASCADE,
  stage text NOT NULL
    CHECK (stage IN (
      'tech_round_1', 'tech_round_2', 'trial_project', 'bill_review',
      'ceo_interview', 'onboarding'
    )),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'scheduled', 'in_progress', 'completed', 'passed', 'failed', 'skipped')),
  interview_session_id uuid REFERENCES public.interview_sessions(id) ON DELETE SET NULL,
  trial_project_id uuid REFERENCES public.trial_projects(id) ON DELETE SET NULL,
  decision text,
  reviewer_user_id uuid,
  notes text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pipeline_id, stage)
);

-- ============ ONBOARDING ENROLLMENTS ============
CREATE TABLE IF NOT EXISTS public.onboarding_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  pipeline_id uuid REFERENCES public.hiring_pipelines(id) ON DELETE SET NULL,
  track_department text NOT NULL,
  core_completed_at timestamptz,
  track_completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, pipeline_id)
);

CREATE INDEX IF NOT EXISTS idx_onboarding_enrollments_user ON public.onboarding_enrollments (user_id);

-- ============ DEPARTMENT SEEDS ============
INSERT INTO public.departments (slug, label, sort_order) VALUES
  ('data-architect', 'Data Architect', 15),
  ('data-engineer', 'Data Engineer', 16),
  ('affiliate-manager', 'Affiliate Manager', 17)
ON CONFLICT (slug) DO UPDATE SET label = EXCLUDED.label, sort_order = EXCLUDED.sort_order;

-- ============ TRIGGERS ============
DROP TRIGGER IF EXISTS trg_hiring_pipelines_updated ON public.hiring_pipelines;
CREATE TRIGGER trg_hiring_pipelines_updated
  BEFORE UPDATE ON public.hiring_pipelines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_trial_projects_updated ON public.trial_projects;
CREATE TRIGGER trg_trial_projects_updated
  BEFORE UPDATE ON public.trial_projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_pipeline_stages_updated ON public.pipeline_stages;
CREATE TRIGGER trg_pipeline_stages_updated
  BEFORE UPDATE ON public.pipeline_stages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-assign all core onboarding + department courses for a user
CREATE OR REPLACE FUNCTION public.auto_enroll_onboarding(_user_id uuid, _department text)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  v_count int := 0;
  r record;
BEGIN
  FOR r IN
    SELECT id FROM public.courses
    WHERE is_core_onboarding = true
       OR id IN (SELECT course_id FROM public.course_departments WHERE department = _department)
  LOOP
    v_count := v_count + public.auto_assign_course(r.id, _user_id);
  END LOOP;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.auto_enroll_onboarding(uuid, text) TO authenticated;
