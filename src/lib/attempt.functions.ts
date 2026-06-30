import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/neon/auth-middleware";
import { supabaseAdmin } from "@/integrations/neon/client.server";
import { mcqAnswersMatch } from "@/lib/mcq-match.server";

const AssignmentIdInput = z.object({ assignmentId: z.string().uuid() });

export interface LearnerQuestion {
  id: string;
  type: "mcq" | "subjective";
  topic: string;
  difficulty: "easy" | "medium" | "hard";
  prompt: string;
  options: string[] | null;
  position: number;
}

/**
 * Returns assessment questions for a learner WITHOUT the correct_answer or
 * rubric columns. Verifies the assignment belongs to the caller.
 */
export const getAttemptQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AssignmentIdInput.parse(d))
  .handler(async ({ data, context }): Promise<LearnerQuestion[]> => {
    const { userId } = context;

    const { data: assignment, error: aErr } = await supabaseAdmin
      .from("assessment_assignments")
      .select("id, learner_user_id, assessment_id")
      .eq("id", data.assignmentId)
      .maybeSingle();
    if (aErr) throw new Error(aErr.message);
    if (!assignment) throw new Error("Assignment not found");
    if (assignment.learner_user_id !== userId) {
      throw new Error("Not authorized");
    }

    const { data: rows, error: qErr } = await supabaseAdmin
      .from("assessment_questions")
      .select("id, type, topic, difficulty, prompt, options, position")
      .eq("assessment_id", assignment.assessment_id)
      .order("position", { ascending: true });
    if (qErr) throw new Error(qErr.message);

    return (rows ?? []).map((r) => ({
      id: r.id as string,
      type: r.type as "mcq" | "subjective",
      topic: (r.topic ?? "") as string,
      difficulty: (r.difficulty ?? "medium") as "easy" | "medium" | "hard",
      prompt: r.prompt as string,
      options: (r.options ?? null) as string[] | null,
      position: (r.position ?? 0) as number,
    }));
  });

const GradeInput = z.object({
  assignmentId: z.string().uuid(),
  attemptId: z.string().uuid(),
  answers: z.record(z.string().uuid(), z.string().max(20000)),
});

export const gradeAndSubmitAttempt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => GradeInput.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    // 1. Verify assignment ownership and load assessment metadata
    const { data: assignment, error: aErr } = await supabaseAdmin
      .from("assessment_assignments")
      .select("id, learner_user_id, assessment_id, due_at, status")
      .eq("id", data.assignmentId)
      .maybeSingle();
    if (aErr) throw new Error(aErr.message);
    if (!assignment) throw new Error("Assignment not found");
    if (assignment.learner_user_id !== userId) throw new Error("Not authorized");
    if (new Date(assignment.due_at).getTime() <= Date.now()) {
      throw new Error("Time expired — submissions are frozen.");
    }

    // 2. Verify attempt ownership
    const { data: attempt, error: atErr } = await supabaseAdmin
      .from("assessment_attempts")
      .select("id, assessment_id, candidate_id, status, candidates!inner(user_id)")
      .eq("id", data.attemptId)
      .maybeSingle();
    if (atErr) throw new Error(atErr.message);
    if (!attempt) throw new Error("Attempt not found");
    const candUserId = (attempt as unknown as { candidates: { user_id: string } })
      .candidates?.user_id;
    if (candUserId !== userId) throw new Error("Not authorized");
    if (attempt.assessment_id !== assignment.assessment_id) {
      throw new Error("Attempt does not match assignment");
    }

    // 3. Load questions WITH correct answers (server-side only)
    const { data: questions, error: qErr } = await supabaseAdmin
      .from("assessment_questions")
      .select("id, type, correct_answer, options")
      .eq("assessment_id", assignment.assessment_id);
    if (qErr) throw new Error(qErr.message);

    // 4. Load pass_mark from assessment
    const { data: assessmentRow } = await supabaseAdmin
      .from("assessments")
      .select("pass_mark")
      .eq("id", assignment.assessment_id)
      .maybeSingle();
    const passMark = (assessmentRow?.pass_mark as number | undefined) ?? 75;

    // 5. Grade MCQs server-side
    const mcqs = (questions ?? []).filter((q) => q.type === "mcq");
    let correct = 0;
    for (const q of mcqs) {
      const given = data.answers[q.id as string] ?? "";
      const options = Array.isArray(q.options) ? (q.options as string[]) : null;
      if (mcqAnswersMatch(given, q.correct_answer as string | null, options)) correct += 1;
    }
    const score = mcqs.length ? Math.round((correct / mcqs.length) * 100) : 0;
    const passed = score >= passMark;

    // 6. Persist answers
    const answerRows = (questions ?? []).map((q) => ({
      attempt_id: data.attemptId,
      question_id: q.id as string,
      answer: data.answers[q.id as string] ?? "",
    }));
    if (answerRows.length) {
      const { error: ansErr } = await supabaseAdmin
        .from("attempt_answers")
        .insert(answerRows);
      if (ansErr) throw new Error(ansErr.message);
    }

    // 7. Record result via existing RPC (handles assignment status update)
    const { error: rpcErr } = await supabaseAdmin.rpc("record_attempt_result", {
      _attempt_id: data.attemptId,
      _score: score,
      _passed: passed,
    });
    if (rpcErr) throw new Error(rpcErr.message);

    try {
      const { onTestCompleted, onFailureRetake } = await import(
        "@/lib/email/triggers.functions"
      );
      await onTestCompleted({ data: { assignmentId: data.assignmentId } });
      if (!passed) {
        await onFailureRetake({ data: { assignmentId: data.assignmentId } });
      }
    } catch (e) {
      console.warn("post-submit email dispatch failed", e);
    }

    return { score, passed };
  });

/**
 * Creates a candidate (if needed), starts an attempt, and marks the assignment in progress.
 */
export const startAttempt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AssignmentIdInput.parse(d))
  .handler(async ({ data, context }): Promise<string> => {
    const { userId } = context;

    const { data: assignment, error: aErr } = await supabaseAdmin
      .from("assessment_assignments")
      .select("id, learner_user_id, assessment_id, attempts_used, status, due_at, max_attempts")
      .eq("id", data.assignmentId)
      .maybeSingle();
    if (aErr) throw new Error(aErr.message);
    if (!assignment) throw new Error("Assignment not found");
    if (assignment.learner_user_id !== userId) throw new Error("Not authorized");
    if (new Date(assignment.due_at).getTime() <= Date.now()) {
      throw new Error("This assignment has expired.");
    }
    if (assignment.status === "passed" || assignment.status === "failed_capped") {
      throw new Error("This assignment is already complete.");
    }
    if (assignment.attempts_used >= assignment.max_attempts) {
      throw new Error("No attempts remaining.");
    }

    const { data: existingCand } = await supabaseAdmin
      .from("candidates")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    let candidateId = existingCand?.id as string | undefined;
    if (!candidateId) {
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("display_name, email")
        .eq("user_id", userId)
        .maybeSingle();
      const { data: created, error: cErr } = await supabaseAdmin
        .from("candidates")
        .insert({
          user_id: userId,
          name: (prof?.display_name as string | null) ?? "Learner",
          email: (prof?.email as string | null) ?? null,
        })
        .select("id")
        .single();
      if (cErr) throw new Error(cErr.message);
      candidateId = created.id as string;
    }

    const nextAttemptNo = (assignment.attempts_used as number) + 1;
    const { data: att, error: attErr } = await supabaseAdmin
      .from("assessment_attempts")
      .insert({
        assessment_id: assignment.assessment_id,
        candidate_id: candidateId,
        attempt_number: nextAttemptNo,
        status: "in_progress",
      })
      .select("id")
      .single();
    if (attErr) throw new Error(attErr.message);

    if (assignment.status === "assigned") {
      const { error: upErr } = await supabaseAdmin
        .from("assessment_assignments")
        .update({ status: "in_progress" })
        .eq("id", assignment.id);
      if (upErr) throw new Error(upErr.message);
    }

    return att.id as string;
  });

export const expireAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AssignmentIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: assignment, error: aErr } = await supabaseAdmin
      .from("assessment_assignments")
      .select("id, learner_user_id, status, due_at")
      .eq("id", data.assignmentId)
      .maybeSingle();
    if (aErr) throw new Error(aErr.message);
    if (!assignment) throw new Error("Assignment not found");
    if (assignment.learner_user_id !== userId) throw new Error("Not authorized");

    const { error: rpcErr } = await supabaseAdmin.rpc("expire_assignment", {
      _assignment_id: data.assignmentId,
    });
    if (rpcErr) throw new Error(rpcErr.message);
    return { expired: true };
  });

export const getLearnerAssignmentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AssignmentIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: assignment, error } = await supabaseAdmin
      .from("assessment_assignments")
      .select("*")
      .eq("id", data.assignmentId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!assignment) return null;
    if (assignment.learner_user_id !== userId) throw new Error("Not authorized");
    return assignment;
  });

/** Learner-safe assessment metadata for the attempt page (no correct answers). */
export const getLearnerAssessmentMetadataFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AssignmentIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: assignment, error: aErr } = await supabaseAdmin
      .from("assessment_assignments")
      .select("learner_user_id, assessment_id")
      .eq("id", data.assignmentId)
      .maybeSingle();
    if (aErr) throw new Error(aErr.message);
    if (!assignment) return null;
    if (assignment.learner_user_id !== userId) throw new Error("Not authorized");

    const { data: assessment, error: qErr } = await supabaseAdmin
      .from("assessments")
      .select("id, title, pass_mark, duration_min, description")
      .eq("id", assignment.assessment_id)
      .maybeSingle();
    if (qErr) throw new Error(qErr.message);
    return assessment;
  });
