import type { Question } from "@/lib/test-types";

export type SafeQuestion = Omit<Question, "correctAnswer" | "rubric"> & {
  correctAnswer?: never;
  rubric?: never;
};

export interface AssessmentQuestionLike {
  id?: string;
  type: string;
  topic?: string | null;
  difficulty?: string | null;
  prompt: string;
  options?: string[] | null;
  correct_answer?: string | null;
  correctAnswer?: string | null;
  rubric?: string | null;
  position?: number;
}

/** Remove answer keys from questions for non–content-manager callers. */
export function stripAssessmentQuestions<T extends AssessmentQuestionLike>(
  rows: T[],
): Array<Omit<T, "correct_answer" | "correctAnswer" | "rubric">> {
  return rows.map(({ correct_answer: _a, correctAnswer: _b, rubric: _c, ...rest }) => rest);
}

export function stripQuestions(questions: Question[]): SafeQuestion[] {
  return questions.map(({ correctAnswer: _a, rubric: _b, ...rest }) => rest);
}
