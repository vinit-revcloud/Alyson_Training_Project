export type Difficulty = "easy" | "medium" | "hard";
export type CandidateLevel = "Novice" | "Mid-Level" | "Expert";
export type QuestionType = "mcq" | "subjective";

export interface Question {
  id: string;
  type: QuestionType;
  topic: string;
  difficulty: Difficulty;
  prompt: string;
  options?: string[];
  correctAnswer?: string;
  rubric?: string;
}

export interface CandidateProfile {
  name: string;
  experience: number;
  role: string;
  level: CandidateLevel;
}
