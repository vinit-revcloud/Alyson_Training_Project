-- Onboarding learner panel: path assignments, item progress, HR policies
-- Apply: npm run db:apply-onboarding-learner

-- Department on candidates (synced from pipeline on bootstrap)
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS department text;

-- ============ LEARNER PATH ASSIGNMENTS ============
CREATE TABLE IF NOT EXISTS public.learner_path_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  pipeline_id uuid REFERENCES public.hiring_pipelines(id) ON DELETE SET NULL,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  assignment_type text NOT NULL DEFAULT 'role_track'
    CHECK (assignment_type IN ('core', 'role_track', 'policy')),
  status text NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'in_progress', 'completed')),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_learner_path_assignments_user
  ON public.learner_path_assignments (user_id);

-- ============ LEARNER ITEM PROGRESS ============
CREATE TABLE IF NOT EXISTS public.learner_item_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  section_id uuid NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  path_assignment_id uuid REFERENCES public.learner_path_assignments(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('not_started', 'in_progress', 'completed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  last_visited_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, section_id)
);

CREATE INDEX IF NOT EXISTS idx_learner_item_progress_user
  ON public.learner_item_progress (user_id);

-- ============ POLICY DOCUMENTS (HR handbook) ============
CREATE TABLE IF NOT EXISTS public.policy_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  summary text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  version int NOT NULL DEFAULT 1,
  requires_acknowledgement boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  sort_order int NOT NULL DEFAULT 0,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.policy_acknowledgements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  policy_document_id uuid NOT NULL REFERENCES public.policy_documents(id) ON DELETE CASCADE,
  policy_version int NOT NULL,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, policy_document_id)
);

CREATE INDEX IF NOT EXISTS idx_policy_acknowledgements_user
  ON public.policy_acknowledgements (user_id);

-- ============ TRIGGERS ============
DROP TRIGGER IF EXISTS trg_learner_path_assignments_updated ON public.learner_path_assignments;
CREATE TRIGGER trg_learner_path_assignments_updated
  BEFORE UPDATE ON public.learner_path_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_learner_item_progress_updated ON public.learner_item_progress;
CREATE TRIGGER trg_learner_item_progress_updated
  BEFORE UPDATE ON public.learner_item_progress
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_policy_documents_updated ON public.policy_documents;
CREATE TRIGGER trg_policy_documents_updated
  BEFORE UPDATE ON public.policy_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Extended auto-enroll: assignments + path rows
CREATE OR REPLACE FUNCTION public.auto_enroll_onboarding(
  _user_id uuid,
  _department text,
  _pipeline_id uuid DEFAULT NULL
)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  v_count int := 0;
  r record;
  v_type text;
BEGIN
  FOR r IN
    SELECT id, is_core_onboarding FROM public.courses
    WHERE status = 'published'
      AND (
        is_core_onboarding = true
        OR id IN (SELECT course_id FROM public.course_departments WHERE department = _department)
      )
  LOOP
    v_count := v_count + public.auto_assign_course(r.id, _user_id);
    v_type := CASE WHEN r.is_core_onboarding THEN 'core' ELSE 'role_track' END;
    INSERT INTO public.learner_path_assignments (
      user_id, pipeline_id, course_id, assignment_type, status
    ) VALUES (_user_id, _pipeline_id, r.id, v_type, 'not_started')
    ON CONFLICT (user_id, course_id) DO UPDATE SET
      pipeline_id = COALESCE(public.learner_path_assignments.pipeline_id, EXCLUDED.pipeline_id),
      updated_at = now();
  END LOOP;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.auto_enroll_onboarding(uuid, text, uuid) TO authenticated;

-- Seed HR handbook policy (published)
INSERT INTO public.policy_documents (
  slug, title, summary, content, version, requires_acknowledgement, status, sort_order, published_at
) VALUES (
  'employee-handbook',
  'Cintara Employee Handbook',
  'Core HR policies, conduct, and workplace expectations for all team members.',
  E'# Employee Handbook\n\nWelcome to Cintara. This handbook outlines our values, workplace policies, and expectations.\n\n## Conduct\n\nTreat colleagues, candidates, and partners with respect. Protect confidential information.\n\n## Remote work\n\nDefault to async communication. Document decisions in shared systems.\n\n## AI usage\n\nFollow the AI Builder methodology and approved tools for client work.\n\n_Acknowledge below to confirm you have read and understood these policies._',
  1,
  true,
  'published',
  1,
  now()
) ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  summary = EXCLUDED.summary,
  content = EXCLUDED.content,
  status = EXCLUDED.status,
  published_at = COALESCE(public.policy_documents.published_at, EXCLUDED.published_at);
