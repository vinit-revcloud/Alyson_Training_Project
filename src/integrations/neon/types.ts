export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      assessment_assignments: {
        Row: {
          assessment_id: string
          assigned_at: string
          assigned_by: string | null
          attempts_used: number
          course_id: string | null
          created_at: string
          due_at: string
          id: string
          last_attempt_id: string | null
          learner_user_id: string
          max_attempts: number
          mode: string
          paused_at: string | null
          paused_reason: string | null
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          assessment_id: string
          assigned_at?: string
          assigned_by?: string | null
          attempts_used?: number
          course_id?: string | null
          created_at?: string
          due_at?: string
          id?: string
          last_attempt_id?: string | null
          learner_user_id: string
          max_attempts?: number
          mode?: string
          paused_at?: string | null
          paused_reason?: string | null
          source?: string
          status?: string
          updated_at?: string
        }
        Update: {
          assessment_id?: string
          assigned_at?: string
          assigned_by?: string | null
          attempts_used?: number
          course_id?: string | null
          created_at?: string
          due_at?: string
          id?: string
          last_attempt_id?: string | null
          learner_user_id?: string
          max_attempts?: number
          mode?: string
          paused_at?: string | null
          paused_reason?: string | null
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_assignments_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_assignments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_assignments_last_attempt_id_fkey"
            columns: ["last_attempt_id"]
            isOneToOne: false
            referencedRelation: "assessment_attempts"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_attempts: {
        Row: {
          assessment_id: string
          attempt_number: number
          candidate_id: string
          class_id: string | null
          created_at: string
          graded_at: string | null
          id: string
          passed: boolean | null
          score: number | null
          started_at: string
          status: string
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          assessment_id: string
          attempt_number?: number
          candidate_id: string
          class_id?: string | null
          created_at?: string
          graded_at?: string | null
          id?: string
          passed?: boolean | null
          score?: number | null
          started_at?: string
          status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          assessment_id?: string
          attempt_number?: number
          candidate_id?: string
          class_id?: string | null
          created_at?: string
          graded_at?: string | null
          id?: string
          passed?: boolean | null
          score?: number | null
          started_at?: string
          status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_attempts_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_attempts_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_attempts_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_questions: {
        Row: {
          assessment_id: string
          correct_answer: string | null
          created_at: string
          difficulty: string
          id: string
          options: Json | null
          position: number
          prompt: string
          rubric: string | null
          topic: string
          type: string
        }
        Insert: {
          assessment_id: string
          correct_answer?: string | null
          created_at?: string
          difficulty?: string
          id?: string
          options?: Json | null
          position?: number
          prompt: string
          rubric?: string | null
          topic?: string
          type: string
        }
        Update: {
          assessment_id?: string
          correct_answer?: string | null
          created_at?: string
          difficulty?: string
          id?: string
          options?: Json | null
          position?: number
          prompt?: string
          rubric?: string | null
          topic?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_questions_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_templates: {
        Row: {
          course_id: string | null
          created_at: string
          created_by: string | null
          description: string
          difficulty_override: string
          duration_min: number
          essay_ratio: number
          id: string
          is_active: boolean
          mcq_ratio: number
          name: string
          pass_mark: number
          role: string
          total_questions: number
          updated_at: string
        }
        Insert: {
          course_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          difficulty_override?: string
          duration_min?: number
          essay_ratio?: number
          id?: string
          is_active?: boolean
          mcq_ratio?: number
          name: string
          pass_mark?: number
          role?: string
          total_questions?: number
          updated_at?: string
        }
        Update: {
          course_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          difficulty_override?: string
          duration_min?: number
          essay_ratio?: number
          id?: string
          is_active?: boolean
          mcq_ratio?: number
          name?: string
          pass_mark?: number
          role?: string
          total_questions?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_templates_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      assessments: {
        Row: {
          class_id: string
          created_at: string
          created_by: string | null
          description: string
          difficulty: string
          duration_min: number
          id: string
          is_primary: boolean
          level: string
          pass_mark: number
          published_at: string | null
          role: string
          source: string
          status: string
          title: string
          updated_at: string
          validated_at: string | null
        }
        Insert: {
          class_id: string
          created_at?: string
          created_by?: string | null
          description?: string
          difficulty?: string
          duration_min?: number
          id?: string
          is_primary?: boolean
          level?: string
          pass_mark?: number
          published_at?: string | null
          role?: string
          source?: string
          status?: string
          title: string
          updated_at?: string
          validated_at?: string | null
        }
        Update: {
          class_id?: string
          created_at?: string
          created_by?: string | null
          description?: string
          difficulty?: string
          duration_min?: number
          id?: string
          is_primary?: boolean
          level?: string
          pass_mark?: number
          published_at?: string | null
          role?: string
          source?: string
          status?: string
          title?: string
          updated_at?: string
          validated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assessments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      attempt_answers: {
        Row: {
          answer: string
          attempt_id: string
          created_at: string
          id: string
          is_correct: boolean | null
          question_id: string
          score: number | null
        }
        Insert: {
          answer?: string
          attempt_id: string
          created_at?: string
          id?: string
          is_correct?: boolean | null
          question_id: string
          score?: number | null
        }
        Update: {
          answer?: string
          attempt_id?: string
          created_at?: string
          id?: string
          is_correct?: boolean | null
          question_id?: string
          score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "attempt_answers_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "assessment_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attempt_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "assessment_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      candidates: {
        Row: {
          created_at: string
          email: string | null
          experience_years: number
          id: string
          level: string
          name: string
          role: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          experience_years?: number
          id?: string
          level?: string
          name: string
          role?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          experience_years?: number
          id?: string
          level?: string
          name?: string
          role?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      classes: {
        Row: {
          audience: string
          course_id: string | null
          created_at: string
          created_by: string | null
          id: string
          level: string
          name: string
          position: number
          status: string
          summary: string
          test_difficulty: string
          test_mcq_count: number
          test_pass_mark: number
          test_retest: boolean
          test_subjective_count: number
          topics: string[]
          updated_at: string
        }
        Insert: {
          audience?: string
          course_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          level?: string
          name: string
          position?: number
          status?: string
          summary?: string
          test_difficulty?: string
          test_mcq_count?: number
          test_pass_mark?: number
          test_retest?: boolean
          test_subjective_count?: number
          topics?: string[]
          updated_at?: string
        }
        Update: {
          audience?: string
          course_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          level?: string
          name?: string
          position?: number
          status?: string
          summary?: string
          test_difficulty?: string
          test_mcq_count?: number
          test_pass_mark?: number
          test_retest?: boolean
          test_subjective_count?: number
          topics?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "classes_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_departments: {
        Row: {
          course_id: string
          created_at: string
          department: string
          id: string
        }
        Insert: {
          course_id: string
          created_at?: string
          department: string
          id?: string
        }
        Update: {
          course_id?: string
          created_at?: string
          department?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_departments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          cover: string
          created_at: string
          created_by: string | null
          description: string
          id: string
          level: string
          role: string
          status: string
          title: string
          topics: string[]
          updated_at: string
        }
        Insert: {
          cover?: string
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          level?: string
          role?: string
          status?: string
          title: string
          topics?: string[]
          updated_at?: string
        }
        Update: {
          cover?: string
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          level?: string
          role?: string
          status?: string
          title?: string
          topics?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      email_notifications: {
        Row: {
          assignment_id: string | null
          audience: string
          created_at: string
          error_message: string | null
          id: string
          kind: string
          metadata: Json
          provider_message_id: string | null
          recipient_email: string
          recipient_user_id: string | null
          sent_at: string | null
          status: string
          subject: string
        }
        Insert: {
          assignment_id?: string | null
          audience?: string
          created_at?: string
          error_message?: string | null
          id?: string
          kind: string
          metadata?: Json
          provider_message_id?: string | null
          recipient_email: string
          recipient_user_id?: string | null
          sent_at?: string | null
          status?: string
          subject: string
        }
        Update: {
          assignment_id?: string | null
          audience?: string
          created_at?: string
          error_message?: string | null
          id?: string
          kind?: string
          metadata?: Json
          provider_message_id?: string | null
          recipient_email?: string
          recipient_user_id?: string | null
          sent_at?: string | null
          status?: string
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_notifications_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assessment_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_template_versions: {
        Row: {
          body_md: string
          created_at: string
          edited_by: string | null
          id: string
          key: string
          subject: string
          template_id: string
        }
        Insert: {
          body_md: string
          created_at?: string
          edited_by?: string | null
          id?: string
          key: string
          subject: string
          template_id: string
        }
        Update: {
          body_md?: string
          created_at?: string
          edited_by?: string | null
          id?: string
          key?: string
          subject?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_template_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          audience: string
          body_md: string
          created_at: string
          id: string
          key: string
          subject: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          audience?: string
          body_md: string
          created_at?: string
          id?: string
          key: string
          subject: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          audience?: string
          body_md?: string
          created_at?: string
          id?: string
          key?: string
          subject?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          department: string | null
          email: string
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["app_role"]
          token: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          department?: string | null
          email: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          token?: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          department?: string | null
          email?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          token?: string
          updated_at?: string
        }
        Relationships: []
      }
      notification_log: {
        Row: {
          assignment_id: string | null
          attempt: number
          audience: string
          created_at: string
          error: string | null
          id: string
          idempotency_key: string | null
          provider_message_id: string | null
          recipient_email: string
          sent_at: string | null
          status: string
          subject: string
          template_key: string
          user_id: string | null
        }
        Insert: {
          assignment_id?: string | null
          attempt?: number
          audience?: string
          created_at?: string
          error?: string | null
          id?: string
          idempotency_key?: string | null
          provider_message_id?: string | null
          recipient_email: string
          sent_at?: string | null
          status?: string
          subject: string
          template_key: string
          user_id?: string | null
        }
        Update: {
          assignment_id?: string | null
          attempt?: number
          audience?: string
          created_at?: string
          error?: string | null
          id?: string
          idempotency_key?: string | null
          provider_message_id?: string | null
          recipient_email?: string
          sent_at?: string | null
          status?: string
          subject?: string
          template_key?: string
          user_id?: string | null
        }
        Relationships: []
      }
      notification_schedules: {
        Row: {
          config: Json
          cron_expression: string
          enabled: boolean
          job_key: string
          label: string
          last_run_at: string | null
          last_run_queued: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          config?: Json
          cron_expression?: string
          enabled?: boolean
          job_key: string
          label: string
          last_run_at?: string | null
          last_run_queued?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          config?: Json
          cron_expression?: string
          enabled?: boolean
          job_key?: string
          label?: string
          last_run_at?: string | null
          last_run_queued?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          department: string | null
          display_name: string | null
          id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          department?: string | null
          display_name?: string | null
          id?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          department?: string | null
          display_name?: string | null
          id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      question_flags: {
        Row: {
          assessment_id: string | null
          created_at: string
          flagged_by: string
          id: string
          question_id: string
          reason: string | null
          resolved: boolean
        }
        Insert: {
          assessment_id?: string | null
          created_at?: string
          flagged_by: string
          id?: string
          question_id: string
          reason?: string | null
          resolved?: boolean
        }
        Update: {
          assessment_id?: string | null
          created_at?: string
          flagged_by?: string
          id?: string
          question_id?: string
          reason?: string | null
          resolved?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "question_flags_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_flags_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "assessment_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      section_assets: {
        Row: {
          created_at: string
          external_url: string | null
          file_name: string
          id: string
          kind: string
          mime_type: string | null
          section_id: string
          size_bytes: number | null
          storage_bucket: string | null
          storage_path: string | null
        }
        Insert: {
          created_at?: string
          external_url?: string | null
          file_name: string
          id?: string
          kind: string
          mime_type?: string | null
          section_id: string
          size_bytes?: number | null
          storage_bucket?: string | null
          storage_path?: string | null
        }
        Update: {
          created_at?: string
          external_url?: string | null
          file_name?: string
          id?: string
          kind?: string
          mime_type?: string | null
          section_id?: string
          size_bytes?: number | null
          storage_bucket?: string | null
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "section_assets_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
        ]
      }
      section_questions: {
        Row: {
          correct_answer: string | null
          created_at: string
          difficulty: string
          id: string
          options: Json | null
          position: number
          prompt: string
          rubric: string | null
          section_id: string
          topic: string
          type: string
        }
        Insert: {
          correct_answer?: string | null
          created_at?: string
          difficulty?: string
          id?: string
          options?: Json | null
          position?: number
          prompt: string
          rubric?: string | null
          section_id: string
          topic?: string
          type: string
        }
        Update: {
          correct_answer?: string | null
          created_at?: string
          difficulty?: string
          id?: string
          options?: Json | null
          position?: number
          prompt?: string
          rubric?: string | null
          section_id?: string
          topic?: string
          type?: string
        }
        Relationships: []
      }
      sections: {
        Row: {
          class_id: string
          created_at: string
          description: string
          duration_min: number
          id: string
          objectives: string
          position: number
          questions_status: string
          questions_updated_at: string | null
          title: string
          updated_at: string
        }
        Insert: {
          class_id: string
          created_at?: string
          description?: string
          duration_min?: number
          id?: string
          objectives?: string
          position?: number
          questions_status?: string
          questions_updated_at?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          class_id?: string
          created_at?: string
          description?: string
          duration_min?: number
          id?: string
          objectives?: string
          position?: number
          questions_status?: string
          questions_updated_at?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sections_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      study_activity: {
        Row: {
          card_key: string | null
          class_id: string | null
          course_id: string | null
          created_at: string
          id: string
          seconds_spent: number
          section_id: string | null
          user_id: string
        }
        Insert: {
          card_key?: string | null
          class_id?: string | null
          course_id?: string | null
          created_at?: string
          id?: string
          seconds_spent?: number
          section_id?: string | null
          user_id: string
        }
        Update: {
          card_key?: string | null
          class_id?: string | null
          course_id?: string | null
          created_at?: string
          id?: string
          seconds_spent?: number
          section_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_activity_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_activity_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_activity_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      auto_assign_course: {
        Args: { _course_id: string; _user_id: string }
        Returns: number
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      expire_assignment: {
        Args: { _assignment_id: string }
        Returns: undefined
      }
      expire_overdue_assignments: { Args: never; Returns: number }
      has_any_role: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      record_attempt_result: {
        Args: { _attempt_id: string; _passed: boolean; _score: number }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "trainer" | "trainee"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "trainer", "trainee"],
    },
  },
} as const
