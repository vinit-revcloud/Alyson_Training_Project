-- Alyson Training — Row Level Security policies for Neon Data API
-- Neon enables RLS on public tables when Data API is on; without policies all writes fail.
-- Apply: npm run db:apply-rls

-- Role helpers (SECURITY DEFINER so they can read user_roles under RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL
    AND public.has_role(auth.uid(), 'admin'::public.app_role);
$$;

CREATE OR REPLACE FUNCTION public.is_content_manager()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'trainer'::public.app_role)
    );
$$;

CREATE OR REPLACE FUNCTION public.is_app_user()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND public.has_any_role(auth.uid());
$$;

-- Grants for authenticated role (idempotent)
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO authenticated;

-- ============ PROFILES & ROLES ============
DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin() OR public.is_content_manager());

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS profiles_update_cm ON public.profiles;
CREATE POLICY profiles_update_cm ON public.profiles FOR UPDATE TO authenticated
  USING (public.is_content_manager())
  WITH CHECK (public.is_content_manager());

DROP POLICY IF EXISTS user_roles_select ON public.user_roles;
CREATE POLICY user_roles_select ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin() OR public.is_content_manager());

DROP POLICY IF EXISTS departments_select ON public.departments;
CREATE POLICY departments_select ON public.departments FOR SELECT TO authenticated
  USING (true);

-- ============ COURSES & CLASSES (content managers write; app users read) ============
DROP POLICY IF EXISTS courses_select ON public.courses;
CREATE POLICY courses_select ON public.courses FOR SELECT TO authenticated
  USING (public.is_app_user());

DROP POLICY IF EXISTS courses_insert ON public.courses;
CREATE POLICY courses_insert ON public.courses FOR INSERT TO authenticated
  WITH CHECK (public.is_content_manager());

DROP POLICY IF EXISTS courses_update ON public.courses;
CREATE POLICY courses_update ON public.courses FOR UPDATE TO authenticated
  USING (public.is_content_manager())
  WITH CHECK (public.is_content_manager());

DROP POLICY IF EXISTS courses_delete ON public.courses;
CREATE POLICY courses_delete ON public.courses FOR DELETE TO authenticated
  USING (public.is_content_manager());

DROP POLICY IF EXISTS course_departments_select ON public.course_departments;
CREATE POLICY course_departments_select ON public.course_departments FOR SELECT TO authenticated
  USING (public.is_app_user());

DROP POLICY IF EXISTS course_departments_write ON public.course_departments;
CREATE POLICY course_departments_write ON public.course_departments FOR ALL TO authenticated
  USING (public.is_content_manager())
  WITH CHECK (public.is_content_manager());

DROP POLICY IF EXISTS classes_select ON public.classes;
CREATE POLICY classes_select ON public.classes FOR SELECT TO authenticated
  USING (public.is_app_user());

DROP POLICY IF EXISTS classes_insert ON public.classes;
CREATE POLICY classes_insert ON public.classes FOR INSERT TO authenticated
  WITH CHECK (public.is_content_manager());

DROP POLICY IF EXISTS classes_update ON public.classes;
CREATE POLICY classes_update ON public.classes FOR UPDATE TO authenticated
  USING (public.is_content_manager())
  WITH CHECK (public.is_content_manager());

DROP POLICY IF EXISTS classes_delete ON public.classes;
CREATE POLICY classes_delete ON public.classes FOR DELETE TO authenticated
  USING (public.is_content_manager());

DROP POLICY IF EXISTS sections_select ON public.sections;
CREATE POLICY sections_select ON public.sections FOR SELECT TO authenticated
  USING (public.is_app_user());

DROP POLICY IF EXISTS sections_write ON public.sections;
CREATE POLICY sections_write ON public.sections FOR ALL TO authenticated
  USING (public.is_content_manager())
  WITH CHECK (public.is_content_manager());

DROP POLICY IF EXISTS section_assets_select ON public.section_assets;
CREATE POLICY section_assets_select ON public.section_assets FOR SELECT TO authenticated
  USING (public.is_app_user());

DROP POLICY IF EXISTS section_assets_write ON public.section_assets;
CREATE POLICY section_assets_write ON public.section_assets FOR ALL TO authenticated
  USING (public.is_content_manager())
  WITH CHECK (public.is_content_manager());

DROP POLICY IF EXISTS section_questions_select ON public.section_questions;
CREATE POLICY section_questions_select ON public.section_questions FOR SELECT TO authenticated
  USING (public.is_app_user());

DROP POLICY IF EXISTS section_questions_write ON public.section_questions;
CREATE POLICY section_questions_write ON public.section_questions FOR ALL TO authenticated
  USING (public.is_content_manager())
  WITH CHECK (public.is_content_manager());

DROP POLICY IF EXISTS section_questions_learner_select ON public.section_questions;
CREATE POLICY section_questions_learner_select ON public.section_questions FOR SELECT TO authenticated
  USING (public.is_app_user());

-- ============ ASSESSMENTS ============
DROP POLICY IF EXISTS assessments_select ON public.assessments;
CREATE POLICY assessments_select ON public.assessments FOR SELECT TO authenticated
  USING (public.is_app_user());

DROP POLICY IF EXISTS assessments_write ON public.assessments;
CREATE POLICY assessments_write ON public.assessments FOR ALL TO authenticated
  USING (public.is_content_manager())
  WITH CHECK (public.is_content_manager());

DROP POLICY IF EXISTS assessment_questions_select ON public.assessment_questions;
CREATE POLICY assessment_questions_select ON public.assessment_questions FOR SELECT TO authenticated
  USING (public.is_content_manager());

DROP POLICY IF EXISTS assessment_questions_write ON public.assessment_questions;
CREATE POLICY assessment_questions_write ON public.assessment_questions FOR ALL TO authenticated
  USING (public.is_content_manager())
  WITH CHECK (public.is_content_manager());

DROP POLICY IF EXISTS assessment_templates_select ON public.assessment_templates;
CREATE POLICY assessment_templates_select ON public.assessment_templates FOR SELECT TO authenticated
  USING (public.is_app_user());

DROP POLICY IF EXISTS assessment_templates_write ON public.assessment_templates;
CREATE POLICY assessment_templates_write ON public.assessment_templates FOR ALL TO authenticated
  USING (public.is_content_manager())
  WITH CHECK (public.is_content_manager());

-- ============ LEARNER FLOW ============
DROP POLICY IF EXISTS assessment_assignments_select ON public.assessment_assignments;
CREATE POLICY assessment_assignments_select ON public.assessment_assignments FOR SELECT TO authenticated
  USING (learner_user_id = auth.uid() OR public.is_content_manager());

DROP POLICY IF EXISTS assessment_assignments_write ON public.assessment_assignments;
CREATE POLICY assessment_assignments_write ON public.assessment_assignments FOR ALL TO authenticated
  USING (public.is_content_manager())
  WITH CHECK (public.is_content_manager());

DROP POLICY IF EXISTS candidates_select ON public.candidates;
CREATE POLICY candidates_select ON public.candidates FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_content_manager());

DROP POLICY IF EXISTS candidates_write ON public.candidates;
CREATE POLICY candidates_write ON public.candidates FOR ALL TO authenticated
  USING (public.is_content_manager())
  WITH CHECK (public.is_content_manager());

DROP POLICY IF EXISTS candidates_learner_insert ON public.candidates;
CREATE POLICY candidates_learner_insert ON public.candidates FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS assessment_assignments_learner_update ON public.assessment_assignments;
CREATE POLICY assessment_assignments_learner_update ON public.assessment_assignments FOR UPDATE TO authenticated
  USING (learner_user_id = auth.uid())
  WITH CHECK (learner_user_id = auth.uid());

DROP POLICY IF EXISTS assessment_attempts_select ON public.assessment_attempts;
CREATE POLICY assessment_attempts_select ON public.assessment_attempts FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.candidates c
      WHERE c.id = candidate_id AND c.user_id = auth.uid()
    )
    OR public.is_content_manager()
  );

DROP POLICY IF EXISTS assessment_attempts_write ON public.assessment_attempts;
CREATE POLICY assessment_attempts_write ON public.assessment_attempts FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.candidates c
      WHERE c.id = candidate_id AND c.user_id = auth.uid()
    )
    OR public.is_content_manager()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.candidates c
      WHERE c.id = candidate_id AND c.user_id = auth.uid()
    )
    OR public.is_content_manager()
  );

DROP POLICY IF EXISTS attempt_answers_select ON public.attempt_answers;
CREATE POLICY attempt_answers_select ON public.attempt_answers FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assessment_attempts a
      JOIN public.candidates c ON c.id = a.candidate_id
      WHERE a.id = attempt_id AND c.user_id = auth.uid()
    )
    OR public.is_content_manager()
  );

DROP POLICY IF EXISTS attempt_answers_write ON public.attempt_answers;
CREATE POLICY attempt_answers_write ON public.attempt_answers FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assessment_attempts a
      JOIN public.candidates c ON c.id = a.candidate_id
      WHERE a.id = attempt_id AND c.user_id = auth.uid()
    )
    OR public.is_content_manager()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.assessment_attempts a
      JOIN public.candidates c ON c.id = a.candidate_id
      WHERE a.id = attempt_id AND c.user_id = auth.uid()
    )
    OR public.is_content_manager()
  );

DROP POLICY IF EXISTS section_progress_select ON public.section_progress;
CREATE POLICY section_progress_select ON public.section_progress FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_content_manager());

DROP POLICY IF EXISTS section_progress_write ON public.section_progress;
CREATE POLICY section_progress_write ON public.section_progress FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS study_activity_select ON public.study_activity;
CREATE POLICY study_activity_select ON public.study_activity FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_content_manager());

DROP POLICY IF EXISTS study_activity_write ON public.study_activity;
CREATE POLICY study_activity_write ON public.study_activity FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============ ADMIN / INVITES ============
DROP POLICY IF EXISTS invites_admin ON public.invites;
CREATE POLICY invites_admin ON public.invites FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS ai_class_generation_write ON public.ai_class_generation;
CREATE POLICY ai_class_generation_write ON public.ai_class_generation FOR ALL TO authenticated
  USING (public.is_content_manager())
  WITH CHECK (public.is_content_manager());

-- Email / notification tables: admin read/write (server cron uses direct SQL)
DROP POLICY IF EXISTS email_templates_read ON public.email_templates;
CREATE POLICY email_templates_read ON public.email_templates FOR SELECT TO authenticated
  USING (public.is_app_user());

DROP POLICY IF EXISTS email_templates_admin ON public.email_templates;
CREATE POLICY email_templates_admin ON public.email_templates FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS notification_schedules_admin ON public.notification_schedules;
CREATE POLICY notification_schedules_admin ON public.notification_schedules FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS notification_log_admin ON public.notification_log;
CREATE POLICY notification_log_admin ON public.notification_log FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS notification_log_admin_write ON public.notification_log;
CREATE POLICY notification_log_admin_write ON public.notification_log FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS notification_log_admin_update ON public.notification_log;
CREATE POLICY notification_log_admin_update ON public.notification_log FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS email_template_versions_admin ON public.email_template_versions;
CREATE POLICY email_template_versions_admin ON public.email_template_versions FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS email_send_log_admin ON public.email_send_log;
CREATE POLICY email_send_log_admin ON public.email_send_log FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS email_send_state_admin ON public.email_send_state;
CREATE POLICY email_send_state_admin ON public.email_send_state FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS suppressed_emails_admin ON public.suppressed_emails;
CREATE POLICY suppressed_emails_admin ON public.suppressed_emails FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS question_flags_read ON public.question_flags;
CREATE POLICY question_flags_read ON public.question_flags FOR SELECT TO authenticated
  USING (public.is_content_manager());

DROP POLICY IF EXISTS question_flags_write ON public.question_flags;
CREATE POLICY question_flags_write ON public.question_flags FOR ALL TO authenticated
  USING (public.is_content_manager())
  WITH CHECK (public.is_content_manager());

-- ============ INTERVIEW SESSIONS (HR/trainer only; candidates use server functions) ============
DROP POLICY IF EXISTS interview_sessions_cm ON public.interview_sessions;
CREATE POLICY interview_sessions_cm ON public.interview_sessions FOR ALL TO authenticated
  USING (public.is_content_manager())
  WITH CHECK (public.is_content_manager());

-- RPC functions used by assignment + email flow
GRANT EXECUTE ON FUNCTION public.auto_assign_course(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_assignment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_attempt_result(uuid, numeric, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) TO authenticated;
