-- Paper-only assessment mode for interview sessions
-- Apply: npm run db:apply-paper-only

ALTER TABLE public.interview_sessions
  ADD COLUMN IF NOT EXISTS assessment_mode text NOT NULL DEFAULT 'online'
  CHECK (assessment_mode IN ('online', 'paper_only', 'hybrid'));

CREATE INDEX IF NOT EXISTS idx_interview_sessions_assessment_mode
  ON public.interview_sessions(assessment_mode, status);
