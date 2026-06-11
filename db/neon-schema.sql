-- Alyson Training LMS — Neon PostgreSQL fresh schema
-- Run once against your Neon database (SQL Editor or: psql $DATABASE_URL -f db/neon-schema.sql)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============ ENUMS ============
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'trainer', 'trainee');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============ HELPERS ============
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============ PROFILES & ROLES ============
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  clerk_user_id text,
  email text,
  display_name text,
  department text,
  status text NOT NULL DEFAULT 'active',
  manager_id uuid,
  hr_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id);
$$;

CREATE TABLE IF NOT EXISTS public.departments (
  slug text PRIMARY KEY,
  label text NOT NULL UNIQUE,
  sort_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.departments (slug, label, sort_order) VALUES
  ('data_scientist', 'Data Scientist', 10),
  ('product_manager', 'Product Manager', 20),
  ('marketing', 'Marketing', 30),
  ('engineer', 'Engineer', 40),
  ('analyst', 'Analyst', 50),
  ('affiliate', 'Affiliate', 60),
  ('hr', 'HR', 70),
  ('operations', 'Operations', 80),
  ('sales', 'Sales', 90)
ON CONFLICT (slug) DO NOTHING;

-- ============ INVITES ============
CREATE TABLE IF NOT EXISTS public.invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  role public.app_role NOT NULL DEFAULT 'trainee',
  department text,
  invited_by uuid,
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  accepted_at timestamptz,
  accepted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============ COURSES & CLASSES ============
CREATE TABLE IF NOT EXISTS public.courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'Data Scientist',
  level text NOT NULL DEFAULT 'Beginner',
  cover text NOT NULL DEFAULT 'from-blue-500 to-indigo-600',
  topics text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'published',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.course_departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  department text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, department)
);

CREATE TABLE IF NOT EXISTS public.classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  name text NOT NULL,
  summary text NOT NULL DEFAULT '',
  level text NOT NULL DEFAULT 'Beginner',
  audience text NOT NULL DEFAULT '',
  topics text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft',
  position int NOT NULL DEFAULT 0,
  test_difficulty text NOT NULL DEFAULT 'Beginner',
  test_mcq_count int NOT NULL DEFAULT 15,
  test_subjective_count int NOT NULL DEFAULT 5,
  test_pass_mark int NOT NULL DEFAULT 75,
  test_retest boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  duration_min int NOT NULL DEFAULT 0,
  objectives text NOT NULL DEFAULT '',
  position int NOT NULL DEFAULT 0,
  questions_status text NOT NULL DEFAULT 'idle',
  questions_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.section_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('video', 'document', 'transcript', 'video_link')),
  storage_bucket text,
  storage_path text,
  external_url text,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  extracted_text text,
  extracted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.section_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  type text NOT NULL,
  topic text NOT NULL DEFAULT '',
  difficulty text NOT NULL DEFAULT 'medium',
  prompt text NOT NULL,
  options jsonb,
  correct_answer text,
  rubric text,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE VIEW public.section_questions_safe AS
  SELECT id, section_id, type, topic, difficulty, prompt, options, position
  FROM public.section_questions;

CREATE TABLE IF NOT EXISTS public.section_progress (
  user_id uuid NOT NULL,
  section_id uuid NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, section_id)
);

CREATE TABLE IF NOT EXISTS public.ai_class_generation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  source_text text,
  ai_generated_title text,
  ai_generated_description text,
  ai_generated_topics jsonb,
  ai_generated_questions jsonb,
  confirmed_by_admin boolean NOT NULL DEFAULT false,
  created_by uuid,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected', 'published')),
  confirmed_at timestamptz,
  confirmed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============ ASSESSMENTS ============
CREATE TABLE IF NOT EXISTS public.assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT '',
  difficulty text NOT NULL DEFAULT 'Intermediate',
  level text NOT NULL DEFAULT 'Mid-Level',
  pass_mark int NOT NULL DEFAULT 75,
  duration_min int NOT NULL DEFAULT 45,
  status text NOT NULL DEFAULT 'draft',
  is_primary boolean NOT NULL DEFAULT true,
  source text NOT NULL DEFAULT 'class',
  purpose text NOT NULL DEFAULT 'training' CHECK (purpose IN ('training', 'interview')),
  interview_weight_mcq int NOT NULL DEFAULT 40,
  interview_weight_subjective int NOT NULL DEFAULT 60,
  created_by uuid,
  validated_at timestamptz,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.assessment_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
  type text NOT NULL,
  topic text NOT NULL DEFAULT '',
  difficulty text NOT NULL DEFAULT 'medium',
  prompt text NOT NULL,
  options jsonb,
  correct_answer text,
  rubric text,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE VIEW public.assessment_questions_safe AS
  SELECT id, assessment_id, type, topic, difficulty, prompt, options, position
  FROM public.assessment_questions;

CREATE TABLE IF NOT EXISTS public.assessment_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT '',
  difficulty text NOT NULL DEFAULT 'Intermediate',
  level text NOT NULL DEFAULT 'Mid-Level',
  pass_mark int NOT NULL DEFAULT 75,
  duration_min int NOT NULL DEFAULT 45,
  questions jsonb NOT NULL DEFAULT '[]',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  name text NOT NULL,
  email text,
  role text NOT NULL DEFAULT '',
  experience_years int NOT NULL DEFAULT 0,
  level text NOT NULL DEFAULT 'Mid-Level',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_candidates_user_id ON public.candidates(user_id) WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.assessment_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_user_id uuid NOT NULL,
  assessment_id uuid NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
  course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  assigned_by uuid,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'auto_department')),
  mode text NOT NULL DEFAULT 'final' CHECK (mode IN ('final', 'practice')),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  max_attempts int NOT NULL DEFAULT 3,
  attempts_used int NOT NULL DEFAULT 0,
  last_attempt_id uuid,
  status text NOT NULL DEFAULT 'assigned'
    CHECK (status IN ('assigned', 'in_progress', 'passed', 'failed_capped', 'expired')),
  paused_at timestamptz,
  paused_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (learner_user_id, assessment_id)
);

CREATE TABLE IF NOT EXISTS public.assessment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'in_progress',
  score numeric(5,2),
  passed boolean,
  attempt_number int NOT NULL DEFAULT 1,
  started_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  graded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.assessment_assignments
  DROP CONSTRAINT IF EXISTS assessment_assignments_last_attempt_id_fkey;
ALTER TABLE public.assessment_assignments
  ADD CONSTRAINT assessment_assignments_last_attempt_id_fkey
  FOREIGN KEY (last_attempt_id) REFERENCES public.assessment_attempts(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.attempt_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES public.assessment_attempts(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.assessment_questions(id) ON DELETE CASCADE,
  answer text NOT NULL DEFAULT '',
  is_correct boolean,
  score numeric(5,2),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.question_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.assessment_questions(id) ON DELETE CASCADE,
  assessment_id uuid REFERENCES public.assessments(id) ON DELETE CASCADE,
  flagged_by uuid NOT NULL,
  reason text,
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.study_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  section_id uuid REFERENCES public.sections(id) ON DELETE SET NULL,
  class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  card_key text,
  seconds_spent int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============ EMAIL ============
CREATE TABLE IF NOT EXISTS public.email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  audience text NOT NULL DEFAULT 'learner',
  subject text NOT NULL,
  body_md text NOT NULL,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.email_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.email_templates(id) ON DELETE CASCADE,
  key text NOT NULL,
  subject text NOT NULL,
  body_md text NOT NULL,
  edited_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  assignment_id uuid,
  template_key text NOT NULL,
  audience text NOT NULL DEFAULT 'learner',
  recipient_email text NOT NULL,
  subject text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  provider_message_id text,
  error text,
  attempt int NOT NULL DEFAULT 0,
  idempotency_key text UNIQUE,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notification_schedules (
  job_key text PRIMARY KEY,
  label text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  cron_expression text NOT NULL DEFAULT '0 9 * * *',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_run_at timestamptz,
  last_run_queued int,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

CREATE TABLE IF NOT EXISTS public.email_send_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id text,
  template_name text NOT NULL,
  recipient_email text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'sent', 'suppressed', 'failed', 'bounced', 'complained', 'dlq')),
  error_message text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.email_send_state (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  retry_after_until timestamptz,
  batch_size int NOT NULL DEFAULT 10,
  send_delay_ms int NOT NULL DEFAULT 200,
  auth_email_ttl_minutes int NOT NULL DEFAULT 15,
  transactional_email_ttl_minutes int NOT NULL DEFAULT 60,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.email_send_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.suppressed_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  reason text NOT NULL,
  source text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.email_unsubscribe_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  token text NOT NULL UNIQUE,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.email_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_email text NOT NULL,
  recipient_user_id uuid,
  assignment_id uuid,
  kind text NOT NULL,
  audience text NOT NULL DEFAULT 'learner',
  subject text NOT NULL,
  status text NOT NULL DEFAULT 'sent',
  sent_at timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.interview_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  candidate_name text NOT NULL,
  candidate_email text NOT NULL,
  role text NOT NULL DEFAULT '',
  level text NOT NULL DEFAULT 'Mid-Level',
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN (
      'scheduled', 'waiting', 'opened', 'in_progress', 'submitted',
      'evaluating', 'evaluated', 'cancelled', 'expired'
    )),
  access_token_hash text NOT NULL,
  opened_at timestamptz,
  opened_by uuid,
  attempt_id uuid REFERENCES public.assessment_attempts(id) ON DELETE SET NULL,
  proctor_notes text NOT NULL DEFAULT '',
  interview_events jsonb NOT NULL DEFAULT '[]'::jsonb,
  ai_evaluation jsonb,
  final_score numeric(5,2),
  final_recommendation text
    CHECK (final_recommendation IS NULL OR final_recommendation IN (
      'strong_hire', 'hire', 'borderline', 'no_hire'
    )),
  hr_override_score numeric(5,2),
  hr_override_notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_interview_sessions_status ON public.interview_sessions(status, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS idx_interview_sessions_token ON public.interview_sessions(access_token_hash);

-- Email queue (replaces pgmq for Neon)
CREATE TABLE IF NOT EXISTS public.email_queue (
  id bigserial PRIMARY KEY,
  queue_name text NOT NULL,
  payload jsonb NOT NULL,
  visible_after timestamptz NOT NULL DEFAULT now(),
  read_count int NOT NULL DEFAULT 0,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_queue_pending ON public.email_queue (queue_name, visible_after)
  WHERE archived_at IS NULL;

CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name text, payload jsonb)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE new_id bigint;
BEGIN
  INSERT INTO public.email_queue (queue_name, payload) VALUES (queue_name, payload) RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name text, batch_size int, vt int)
RETURNS TABLE(msg_id bigint, read_ct int, enqueued_at timestamptz, message jsonb)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT q.id FROM public.email_queue q
    WHERE q.queue_name = read_email_batch.queue_name
      AND q.archived_at IS NULL
      AND q.visible_after <= now()
    ORDER BY q.id
    LIMIT batch_size
    FOR UPDATE SKIP LOCKED
  ),
  updated AS (
    UPDATE public.email_queue q
    SET read_count = q.read_count + 1,
        visible_after = now() + make_interval(secs => vt)
    FROM picked WHERE q.id = picked.id
    RETURNING q.id, q.read_count, q.created_at, q.payload
  )
  SELECT u.id, u.read_count, u.created_at, u.payload FROM updated u;
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_email(queue_name text, message_id bigint)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.email_queue eq
  SET archived_at = now()
  WHERE eq.id = archive_email.message_id AND eq.queue_name = archive_email.queue_name;
END;
$$;

CREATE OR REPLACE FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.enqueue_email(dlq_name, payload);
  PERFORM public.archive_email(source_queue, message_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_email(queue_name text, message_id bigint)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.archive_email(queue_name, message_id);
END;
$$;

-- ============ BUSINESS LOGIC ============
CREATE OR REPLACE FUNCTION public.set_assignment_due_date()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.due_at IS NULL THEN
    NEW.due_at := COALESCE(NEW.assigned_at, now()) + interval '14 days';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assignment_due_date ON public.assessment_assignments;
CREATE TRIGGER trg_assignment_due_date
  BEFORE INSERT ON public.assessment_assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_assignment_due_date();

CREATE OR REPLACE FUNCTION public.expire_assignment(_assignment_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.assessment_assignments
  SET status = 'expired', updated_at = now()
  WHERE id = _assignment_id
    AND status IN ('assigned', 'in_progress')
    AND due_at <= now();
END;
$$;

CREATE OR REPLACE FUNCTION public.record_attempt_result(_attempt_id uuid, _score numeric, _passed boolean)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_assessment uuid;
  v_user uuid;
  v_assignment public.assessment_assignments%ROWTYPE;
BEGIN
  SELECT a.assessment_id, c.user_id INTO v_assessment, v_user
  FROM public.assessment_attempts a
  JOIN public.candidates c ON c.id = a.candidate_id
  WHERE a.id = _attempt_id;

  UPDATE public.assessment_attempts
  SET score = _score, passed = _passed, status = 'graded',
      graded_at = now(), submitted_at = COALESCE(submitted_at, now())
  WHERE id = _attempt_id;

  IF v_user IS NULL OR v_assessment IS NULL THEN RETURN; END IF;

  SELECT * INTO v_assignment FROM public.assessment_assignments
  WHERE learner_user_id = v_user AND assessment_id = v_assessment FOR UPDATE;

  IF NOT FOUND THEN RETURN; END IF;

  UPDATE public.assessment_assignments
  SET attempts_used = v_assignment.attempts_used + 1,
      last_attempt_id = _attempt_id,
      status = CASE
        WHEN _passed THEN 'passed'
        WHEN v_assignment.attempts_used + 1 >= v_assignment.max_attempts THEN 'failed_capped'
        ELSE 'assigned'
      END
  WHERE id = v_assignment.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_assign_course(_course_id uuid, _user_id uuid)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE v_count int := 0; r record;
BEGIN
  FOR r IN
    SELECT a.id AS assessment_id FROM public.assessments a
    JOIN public.classes cl ON cl.id = a.class_id
    WHERE cl.course_id = _course_id AND a.is_primary = true
      AND a.status IN ('validated', 'published')
  LOOP
    INSERT INTO public.assessment_assignments (learner_user_id, assessment_id, course_id, source)
    VALUES (_user_id, r.assessment_id, _course_id, 'auto_department')
    ON CONFLICT (learner_user_id, assessment_id) DO NOTHING;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- ============ SEED EMAIL TEMPLATES ============
INSERT INTO public.email_templates (key, audience, subject, body_md) VALUES
('assignment_new','learner','New assignment: {assignment_name}',
 E'Hi {learner_name},\n\nYou have been assigned **{assignment_name}** as part of *{course_name}*.\n\n- **Due:** {due_date}\n- **Start here:** {retake_link}\n\n— The Alyson team'),
('reminder_daily','learner','Reminder: {assignment_name} is waiting for you',
 E'Hi {learner_name},\n\nFriendly reminder: **{assignment_name}** ({course_name}) is still pending.\n\n- **Due:** {due_date}\n- **Continue:** {retake_link}\n\n— The Alyson team'),
('escalation_day7','learner','Action needed: {assignment_name} is 7 days overdue',
 E'Hi {learner_name},\n\n**{assignment_name}** is 7 days overdue. Complete it: {retake_link}\n\n— The Alyson team'),
('escalation_day14','learner','Second notice: {assignment_name} is 14 days overdue',
 E'Hi {learner_name},\n\n**{assignment_name}** is 14 days overdue. Your manager has been notified.\n\nResume: {retake_link}\n\n— The Alyson team'),
('escalation_day30','admin','Critical: {learner_name} 30 days overdue on {assignment_name}',
 E'{learner_name} has not completed **{assignment_name}** after 30 days.\n\nPlease review in the admin panel.'),
('failure_retake','learner','Retake available: {assignment_name}',
 E'Hi {learner_name},\n\nYour attempt on **{assignment_name}** did not meet the passing score ({current_score}).\n\nRetake: {retake_link}\n\n— The Alyson team'),
('invite_new','learner','You''re invited to Alyson Training',
 E'Hi {learner_name},\n\nYou have been invited to join **Alyson Training**.\n\n{retake_link}\n\n— The Alyson team'),
('test_completed','admin','Test submitted: {assignment_name} — {current_score}',
 E'{learner_name} submitted **{assignment_name}**.\n\n- **Score:** {current_score}\n- **Due:** {due_date}'),
('weekly_ceo_summary','admin','Weekly training summary — {current_score}',
 E'Hi {learner_name},\n\n**Weekly training snapshot**\n\n- **Progress:** {current_score}\n- **Pending assignments:** see dashboard\n- **Open analytics:** {retake_link}\n\n— Alyson Training'),
('interview_invite','learner','Interview test invitation — {assignment_name}',
 E'Hi {learner_name},\n\nYou have been invited to complete a technical interview assessment: **{assignment_name}**.\n\n- **Role:** {course_name}\n- **Scheduled:** {due_date}\n\nWhen your interview begins, HR will ask you to share your screen on the video call. Open this link to confirm your identity and wait for the test to unlock:\n\n{retake_link}\n\n— Alyson Training'),
('interview_submitted','admin','Interview submitted: {learner_name} — {assignment_name}',
 E'**{learner_name}** has submitted the interview test **{assignment_name}**.\n\nReview the AI evaluation: {retake_link}\n\n— Alyson Training'),
('interview_evaluated','admin','Interview evaluation ready: {learner_name} — {current_score}',
 E'AI evaluation is ready for **{learner_name}** on **{assignment_name}**.\n\n- **Overall score:** {current_score}\n- **Review:** {retake_link}\n\n— Alyson Training')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.notification_schedules (job_key, label, enabled, cron_expression, config) VALUES
  ('assignment_new', 'New assignment notice', true, 'on_event', '{"immediate": true}'::jsonb),
  ('reminder_daily', 'Daily reminders', true, '0 9 * * *', '{"only_when_due_within_days": 1}'::jsonb),
  ('escalation', 'Overdue escalations', true, '0 9 * * *',
   '{"tiers":[{"days":7,"audiences":["learner"]},{"days":14,"audiences":["learner","hr"]},{"days":30,"audiences":["learner","hr","ceo","admin"]}]}'::jsonb),
  ('failure_retake', 'Failure / retake offer', true, 'on_event', '{"delay_hours": 0}'::jsonb),
  ('test_completed', 'Test submitted notice', true, 'on_event', '{}'::jsonb),
  ('weekly_ceo_summary', 'Weekly CEO progress summary', false, '0 9 * * 1', '{}'::jsonb)
ON CONFLICT (job_key) DO NOTHING;

-- ============ INDEXES ============
CREATE INDEX IF NOT EXISTS idx_assignments_learner ON public.assessment_assignments(learner_user_id);
CREATE INDEX IF NOT EXISTS idx_nlog_status ON public.notification_log(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_study_activity_user ON public.study_activity(user_id, created_at DESC);

-- Clerk migration: link Clerk user_* ids to internal profiles.user_id
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS clerk_user_id text;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_clerk_user_id_unique ON public.profiles (clerk_user_id) WHERE clerk_user_id IS NOT NULL;
