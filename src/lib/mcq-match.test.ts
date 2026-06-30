import { describe, expect, it } from "vitest";
import { mcqAnswersMatch } from "@/lib/mcq-match.server";

const OPTIONS = ["Paris", "London", "Berlin", "Madrid"];

describe("mcqAnswersMatch", () => {
  it("matches identical option text", () => {
    expect(mcqAnswersMatch("Paris", "Paris", OPTIONS)).toBe(true);
    expect(mcqAnswersMatch("  paris ", "Paris", OPTIONS)).toBe(true);
  });

  it("matches letter key to option text", () => {
    expect(mcqAnswersMatch("Paris", "A", OPTIONS)).toBe(true);
    expect(mcqAnswersMatch("A", "Paris", OPTIONS)).toBe(true);
  });

  it("rejects wrong answers", () => {
    expect(mcqAnswersMatch("London", "Paris", OPTIONS)).toBe(false);
    expect(mcqAnswersMatch("", "Paris", OPTIONS)).toBe(false);
  });
});
