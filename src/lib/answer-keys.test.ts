import { describe, expect, it } from "vitest";
import { stripAssessmentQuestions, stripQuestions } from "@/lib/answer-keys.server";

describe("answer-keys", () => {
  it("strips correct_answer and rubric from assessment rows", () => {
    const rows = stripAssessmentQuestions([
      {
        id: "1",
        type: "mcq",
        prompt: "Q?",
        correct_answer: "secret",
        rubric: "hidden",
      },
    ]);
    expect(rows[0]).not.toHaveProperty("correct_answer");
    expect(rows[0]).not.toHaveProperty("rubric");
    expect(rows[0].prompt).toBe("Q?");
  });

  it("strips Question answer keys", () => {
    const safe = stripQuestions([
      {
        type: "mcq",
        topic: "SQL",
        difficulty: "easy",
        prompt: "Pick one",
        correctAnswer: "A",
        rubric: "n/a",
      },
    ]);
    expect(safe[0]).not.toHaveProperty("correctAnswer");
    expect(safe[0]).not.toHaveProperty("rubric");
  });
});
