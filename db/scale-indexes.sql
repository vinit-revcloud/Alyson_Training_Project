-- Performance indexes for 1k-user scale (idempotent).
CREATE INDEX IF NOT EXISTS idx_sections_class_id ON sections (class_id);
CREATE INDEX IF NOT EXISTS idx_section_assets_section_id ON section_assets (section_id);
CREATE INDEX IF NOT EXISTS idx_section_questions_section_id ON section_questions (section_id);
CREATE INDEX IF NOT EXISTS idx_assessments_class_id ON assessments (class_id);
CREATE INDEX IF NOT EXISTS idx_assessments_class_primary ON assessments (class_id, is_primary);
CREATE INDEX IF NOT EXISTS idx_assessment_questions_assessment_id ON assessment_questions (assessment_id);
CREATE INDEX IF NOT EXISTS idx_assessment_attempts_assessment_id ON assessment_attempts (assessment_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles (user_id);
CREATE INDEX IF NOT EXISTS idx_classes_course_id ON classes (course_id);
CREATE INDEX IF NOT EXISTS idx_classes_status ON classes (status);
CREATE INDEX IF NOT EXISTS idx_profiles_status ON profiles (status);

-- AI usage tracking for executive cost dashboard
CREATE TABLE IF NOT EXISTS ai_usage_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(user_id) ON DELETE SET NULL,
  feature text NOT NULL,
  model text,
  tokens_in int DEFAULT 0,
  tokens_out int DEFAULT 0,
  duration_ms int DEFAULT 0,
  estimated_cost_usd numeric(10, 6) DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_log_created_at ON ai_usage_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_log_user_id ON ai_usage_log (user_id);
