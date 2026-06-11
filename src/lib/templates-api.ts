import {
  createTemplateFn,
  deleteTemplateFn,
  listTemplatesFn,
  updateTemplateFn,
} from "@/lib/templates.functions";

export type TemplateDifficulty = "Easy" | "Intermediate" | "Hard" | "Mixed";

export interface TemplateMixConfig {
  total_questions: number;
  mcq_ratio: number;
  essay_ratio: number;
}

export interface AssessmentTemplate {
  id: string;
  title: string;
  description: string;
  role: string;
  difficulty: TemplateDifficulty;
  level: string;
  pass_mark: number;
  duration_min: number;
  mix: TemplateMixConfig;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type TemplateInput = {
  title: string;
  description: string;
  role: string;
  difficulty: TemplateDifficulty;
  level: string;
  pass_mark: number;
  duration_min: number;
  mix: TemplateMixConfig;
};

export async function listTemplates(): Promise<AssessmentTemplate[]> {
  return listTemplatesFn();
}

export async function createTemplate(input: TemplateInput): Promise<AssessmentTemplate> {
  return createTemplateFn({ data: input });
}

export async function updateTemplate(id: string, patch: Partial<TemplateInput>): Promise<void> {
  await updateTemplateFn({ data: { id, patch } });
}

export async function deleteTemplate(id: string): Promise<void> {
  await deleteTemplateFn({ data: { id } });
}
