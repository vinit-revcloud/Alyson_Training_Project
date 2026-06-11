-- Interview sessions for external candidate proctored tests
-- Apply: node -e "..." or psql $DATABASE_URL -f db/interview-sessions.sql

ALTER TABLE public.assessments
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'training'
  CHECK (purpose IN ('training', 'interview'));

ALTER TABLE public.assessments
  ADD COLUMN IF NOT EXISTS interview_weight_mcq int NOT NULL DEFAULT 40;

ALTER TABLE public.assessments
  ADD COLUMN IF NOT EXISTS interview_weight_subjective int NOT NULL DEFAULT 60;

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
CREATE INDEX IF NOT EXISTS idx_interview_sessions_candidate_email ON public.interview_sessions(lower(candidate_email));

ALTER TABLE public.interview_sessions
  ADD COLUMN IF NOT EXISTS in_person_flow jsonb NOT NULL DEFAULT '{
    "stages": [
      {"id":"office_arrival","label":"Office arrival & welcome","description":"Candidate arrives, ID check, brief orientation.","status":"pending","notes":"","score":null,"completed_at":null},
      {"id":"written_test","label":"Written / paper test","description":"Candidate completes the assessment (digital or paper).","status":"pending","notes":"","score":null,"completed_at":null},
      {"id":"team_meet","label":"Team meet & greet","description":"Introduction to team members and workspace tour.","status":"pending","notes":"","score":null,"completed_at":null},
      {"id":"lunch","label":"Lunch (optional)","description":"Informal lunch to observe communication and rapport.","status":"pending","notes":"","score":null,"completed_at":null},
      {"id":"verbal_interview","label":"Verbal interview & fit","description":"Structured interview on experience, communication, and culture fit.","status":"pending","notes":"","score":null,"completed_at":null}
    ]
  }'::jsonb;

ALTER TABLE public.interview_sessions
  ADD COLUMN IF NOT EXISTS paper_assessment jsonb;

INSERT INTO public.email_templates (key, audience, subject, body_md) VALUES
('interview_invite','learner','Interview test invitation — {assignment_name}',
 E'Hi {learner_name},\n\nYou have been invited to complete a technical interview assessment: **{assignment_name}**.\n\n- **Role:** {course_name}\n- **Scheduled:** {due_date}\n\nWhen your interview begins, HR will ask you to share your screen on the video call. Open this link to confirm your identity and wait for the test to unlock:\n\n{retake_link}\n\n— Alyson Training'),
('interview_submitted','admin','Interview submitted: {learner_name} — {assignment_name}',
 E'**{learner_name}** has submitted the interview test **{assignment_name}**.\n\nReview the AI evaluation: {retake_link}\n\n— Alyson Training'),
('interview_evaluated','admin','Interview evaluation ready: {learner_name} — {current_score}',
 E'AI evaluation is ready for **{learner_name}** on **{assignment_name}**.\n\n- **Overall score:** {current_score}\n- **Review:** {retake_link}\n\n— Alyson Training')
ON CONFLICT (key) DO NOTHING;
