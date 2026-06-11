import { readAssetFile } from "@/lib/asset-storage.server";
import { llmVisionCompletion } from "@/lib/ai/llm";
import { getPgPool } from "@/lib/pg.server";
import type { PaperAssessment, ProfileDimensionScore } from "./interview.shared";
import {
  PROFILE_DIMENSION_DEFS,
  parseAiEvaluation,
  parsePaperAssessment,
} from "./interview.shared";
import { synthesizeCandidateProfile, applyProfileToEvaluation } from "./profile-evaluate.server";
import { getAssessmentRubricContextForSession, type AssessmentRubricItem } from "./interview.server";

function mimeForFilename(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}

function formatRubricForVision(items: AssessmentRubricItem[]): string {
  if (!items.length) return "";
  return items
    .map((q, i) => {
      const parts = [
        `Q${q.position ?? i + 1} [${q.type}]`,
        q.prompt,
        q.rubric ? `Rubric: ${q.rubric}` : null,
        q.type === "mcq" && q.correct_answer ? `Expected MCQ answer: ${q.correct_answer}` : null,
      ].filter(Boolean);
      return parts.join("\n");
    })
    .join("\n\n");
}

export async function gradePaperAssessment(sessionId: string): Promise<PaperAssessment> {
  const pool = getPgPool();
  const { rows } = await pool.query<{
    role: string;
    level: string;
    candidate_name: string;
    assessment_mode: string;
    paper_assessment: unknown;
    ai_evaluation: unknown;
    proctor_notes: string;
    in_person_flow: unknown;
  }>(
    `SELECT role, level, candidate_name, assessment_mode, paper_assessment, ai_evaluation,
            proctor_notes, in_person_flow
     FROM interview_sessions WHERE id = $1`,
    [sessionId],
  );
  const session = rows[0];
  if (!session) throw new Error("Session not found.");

  const paper = parsePaperAssessment(session.paper_assessment) ?? { uploads: [] };
  if (!paper.uploads.length) {
    throw new Error("Upload at least one photo of the completed paper test first.");
  }

  const images: { mime: string; base64: string; filename: string }[] = [];
  for (const upload of paper.uploads) {
    const buf = await readAssetFile("interview-papers", upload.storage_path);
    if (!buf) continue;
    images.push({
      mime: mimeForFilename(upload.filename),
      base64: buf.toString("base64"),
      filename: upload.filename,
    });
  }

  if (!images.length) {
    throw new Error("Could not read uploaded paper images from storage.");
  }

  const rubricItems = await getAssessmentRubricContextForSession(sessionId);
  const rubricBlock = formatRubricForVision(rubricItems);

  let extractedText = "";
  let profile_dimensions: ProfileDimensionScore[] = [];
  let summary = "";
  let overall_score = 0;

  try {
    const raw = await llmVisionCompletion({
      system: `You analyze photos of a completed paper employment/test assessment.
Extract all visible answers and grade them for a ${session.level} ${session.role} candidate.

When an official question blueprint is provided below, grade against those prompts and rubrics.
Match handwritten answers to the closest question number. For MCQs, compare to the expected answer when given.

Return JSON:
{
  "extracted_text": "transcription of answers as markdown",
  "overall_score": 0-100,
  "summary": "2-4 sentence grading summary",
  "profile_dimensions": [
    { "key": "iq_reasoning|math|reading_comprehension|critical_thinking|writing_ability|personality_work_style|role_specific_knowledge", "label": "...", "score": 0-100, "summary": "...", "evidence": ["..."] }
  ]
}
Include all seven dimension keys once. If handwriting is illegible, note that in summary.`,
      userText: [
        `Grade this paper test for ${session.candidate_name} (${session.role}, ${session.level}).`,
        `${images.length} page(s) attached.`,
        rubricBlock
          ? `\n--- Official assessment blueprint ---\n${rubricBlock}\n--- End blueprint ---`
          : "",
      ].join(""),
      images: images.map((img) => ({ mime: img.mime, base64: img.base64 })),
      jsonMode: true,
      maxTokens: 4096,
    });

    const parsed = JSON.parse(raw) as {
      extracted_text?: string;
      overall_score?: number;
      summary?: string;
      profile_dimensions?: ProfileDimensionScore[];
    };

    extractedText = parsed.extracted_text?.trim() ?? "";
    summary = parsed.summary?.trim() ?? "Paper test graded from uploaded photos.";
    overall_score = Math.min(100, Math.max(0, Math.round(Number(parsed.overall_score) || 0)));

    const byKey = new Map((parsed.profile_dimensions ?? []).map((d) => [d.key, d]));
    profile_dimensions = PROFILE_DIMENSION_DEFS.map((def) => {
      const hit = byKey.get(def.key);
      return {
        key: def.key,
        label: def.label,
        score: Math.min(100, Math.max(0, Math.round(Number(hit?.score) || 0))),
        summary: hit?.summary?.trim() || summary,
        evidence: Array.isArray(hit?.evidence) ? hit!.evidence!.map(String).slice(0, 5) : [],
      };
    });
  } catch (e) {
    console.warn("[paper-grade] vision grading failed", e);
    summary = "Paper photos uploaded but AI vision grading failed. Review images manually.";
    profile_dimensions = PROFILE_DIMENSION_DEFS.map((def) => ({
      key: def.key,
      label: def.label,
      score: 0,
      summary: "Not graded automatically.",
      evidence: [],
    }));
  }

  const graded: PaperAssessment = {
    ...paper,
    extracted_text: extractedText,
    overall_score,
    summary,
    profile_dimensions,
    graded_at: new Date().toISOString(),
    status: "graded",
  };

  await pool.query(
    `UPDATE interview_sessions SET paper_assessment = $2::jsonb, updated_at = now() WHERE id = $1`,
    [sessionId, JSON.stringify(graded)],
  );

  const existingEval = parseAiEvaluation(session.ai_evaluation);
  if (existingEval && session.assessment_mode !== "paper_only") {
    const profile = await synthesizeCandidateProfile({
      role: session.role,
      level: session.level,
      candidateName: session.candidate_name,
      assessmentTitle: "Paper + online assessment",
      questionEvals: existingEval.questions,
      answerContexts: existingEval.questions.map((q) => ({
        question_id: q.question_id,
        prompt: q.prompt,
        type: q.type,
        topic: "",
        answer: "",
        score: q.score,
        feedback: q.feedback,
      })),
      proctorNotes: session.proctor_notes,
      inPersonFlow: null,
      paperAssessment: graded,
    });

    const merged = applyProfileToEvaluation(existingEval, profile, graded);
    await pool.query(
      `UPDATE interview_sessions SET ai_evaluation = $2::jsonb, updated_at = now() WHERE id = $1`,
      [sessionId, JSON.stringify(merged)],
    );
  }

  return graded;
}
