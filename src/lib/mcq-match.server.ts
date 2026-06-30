/**
 * Compare a learner's MCQ answer to the stored correct_answer.
 * Handles full option text (UI default) and single-letter keys (A–D) from AI generation.
 */
export function mcqAnswersMatch(
  given: string,
  expected: string | null | undefined,
  options?: string[] | null,
): boolean {
  const g = given.trim();
  const e = (expected ?? "").trim();
  if (!g || !e) return false;
  if (g.toLowerCase() === e.toLowerCase()) return true;

  const opts = (options ?? []).map((o) => o.trim()).filter(Boolean);
  if (!opts.length) return false;

  const indexFromLetter = (s: string): number | null => {
    if (!/^[a-d]$/i.test(s)) return null;
    const idx = s.toUpperCase().charCodeAt(0) - 65;
    return idx >= 0 && idx < opts.length ? idx : null;
  };

  const expectedIdx = indexFromLetter(e);
  if (expectedIdx != null && g.toLowerCase() === opts[expectedIdx]!.toLowerCase()) return true;

  const givenIdx = indexFromLetter(g);
  if (givenIdx != null && opts[givenIdx]!.toLowerCase() === e.toLowerCase()) return true;
  if (givenIdx != null && expectedIdx != null && givenIdx === expectedIdx) return true;

  return false;
}
