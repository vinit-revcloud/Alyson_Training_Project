-- Seed core onboarding course shells (content added via admin class builder)
-- Apply: npm run db:apply-onboarding-seeds

INSERT INTO public.courses (id, title, description, role, level, status, is_core_onboarding)
VALUES
  (
    'a1000001-0001-4000-8000-000000000001',
    'How to be an AI Builder',
    'Shared process, tools, and standards for building with AI at Cintara.',
    'All Roles',
    'Beginner',
    'published',
    true
  ),
  (
    'a1000001-0001-4000-8000-000000000002',
    'Business Process',
    'Company workflows, experiment team context, and how we deliver.',
    'All Roles',
    'Beginner',
    'published',
    true
  )
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  is_core_onboarding = EXCLUDED.is_core_onboarding,
  status = EXCLUDED.status;

-- Role-track course shells (link departments via course editor after import)
INSERT INTO public.courses (id, title, description, role, level, status, is_core_onboarding)
VALUES
  (
    'a1000002-0001-4000-8000-000000000001',
    'Data Scientist Onboarding Track',
    'Role-specific onboarding for Data Scientist hires.',
    'Data Scientist',
    'Beginner',
    'published',
    false
  ),
  (
    'a1000002-0001-4000-8000-000000000002',
    'Analyst Onboarding Track',
    'Role-specific onboarding for Analyst hires.',
    'Analyst',
    'Beginner',
    'published',
    false
  ),
  (
    'a1000002-0001-4000-8000-000000000003',
    'Marketing Onboarding Track',
    'Role-specific onboarding for Marketing hires.',
    'Marketing',
    'Beginner',
    'published',
    false
  )
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  status = EXCLUDED.status;

INSERT INTO public.course_departments (course_id, department)
VALUES
  ('a1000002-0001-4000-8000-000000000001', 'Data Scientist'),
  ('a1000002-0001-4000-8000-000000000002', 'Analyst'),
  ('a1000002-0001-4000-8000-000000000003', 'Marketing')
ON CONFLICT (course_id, department) DO NOTHING;
