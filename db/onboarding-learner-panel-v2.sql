-- Resume position + profile learn columns
-- Apply: npm run db:apply-onboarding-learner-v2

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_learn_course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_learn_section_id uuid REFERENCES public.sections(id) ON DELETE SET NULL;
