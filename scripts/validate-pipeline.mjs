/**
 * Smoke-check class creation validation scenarios (mirrors class-create.validation.ts).
 * Usage: npm run validate:pipeline
 */

function validateWizardSteps(input) {
  const issues = [];
  if (!input.name.trim()) issues.push({ step: 0, message: "Class needs a name" });
  if (!input.topics.length) issues.push({ step: 1, message: "Assign at least one topic" });
  for (const [i, s] of input.sections.entries()) {
    const label = s.title?.trim() || `Section ${i + 1}`;
    if (!s.title?.trim()) issues.push({ step: 2, message: `Section ${i + 1} needs a title` });
    if (s.durationMin <= 0) issues.push({ step: 2, message: `${label} needs a duration` });
    if (!s.videoFile && !s.videoLink?.trim()) issues.push({ step: 3, message: `Add video for ${label}` });
    if (!(s.documents?.length ?? 0)) issues.push({ step: 4, message: `Attach doc to ${label}` });
  }
  return issues;
}

function normalizeTestConfig(test) {
  return {
    difficulty: test.difficulty ?? "Beginner",
    mcqCount: Math.max(1, Math.min(50, Math.floor(Number(test.mcqCount) || 1))),
    subjectiveCount: Math.max(0, Math.min(20, Math.floor(Number(test.subjectiveCount) || 0))),
    passMark: Math.max(50, Math.min(100, Math.floor(Number(test.passMark) || 75))),
  };
}

const section = (title) => ({
  title,
  durationMin: 15,
  videoLink: "https://example.com/v",
  documents: [1],
});

const ok = validateWizardSteps({
  name: "Python Class",
  topics: ["Python"],
  sections: [section("A"), section("B"), section("C")],
});
if (ok.length) {
  console.error("FAIL valid wizard", ok);
  process.exit(1);
}

const bad = validateWizardSteps({
  name: "X",
  topics: ["t"],
  sections: [{ title: "S", durationMin: 10, videoLink: "", documents: [] }],
});
if (!bad.some((i) => i.step === 3 || i.step === 4)) {
  console.error("FAIL should catch missing video/docs");
  process.exit(1);
}

const test = normalizeTestConfig({ mcqCount: 0, passMark: 30 });
if (test.mcqCount < 1 || test.passMark < 50) {
  console.error("FAIL normalize test config");
  process.exit(1);
}

console.log("✓ Pipeline validation scenarios passed");
