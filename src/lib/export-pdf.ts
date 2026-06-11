import { jsPDF } from "jspdf";
import type { CandidateProfile, Question } from "./test-types";

export function exportTestPdf(profile: CandidateProfile, questions: Question[], withAnswerKey: boolean) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 48;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  let y = margin;

  const writeLine = (text: string, opts: { size?: number; bold?: boolean; indent?: number } = {}) => {
    const { size = 11, bold = false, indent = 0 } = opts;
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, pageW - margin * 2 - indent);
    for (const line of lines) {
      if (y > pageH - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(line, margin + indent, y);
      y += size * 1.35;
    }
  };

  writeLine("Data Scientist Candidate Assessment", { size: 18, bold: true });
  y += 4;
  writeLine(`Candidate: ${profile.name || "—"}`, { size: 11 });
  writeLine(`Role: ${profile.role}    Experience: ${profile.experience} yrs    Level: ${profile.level}`);
  writeLine(`Total questions: ${questions.length}`);
  y += 8;
  doc.setDrawColor(200);
  doc.line(margin, y, pageW - margin, y);
  y += 16;

  const mcqs = questions.filter((q) => q.type === "mcq");
  const subj = questions.filter((q) => q.type === "subjective");

  let idx = 1;
  if (mcqs.length) {
    writeLine("Section A — Multiple Choice", { size: 13, bold: true });
    y += 4;
    for (const q of mcqs) {
      writeLine(`${idx}. [${q.topic} • ${q.difficulty}]  ${q.prompt}`, { bold: true });
      q.options?.forEach((opt, i) => {
        writeLine(`${String.fromCharCode(65 + i)}. ${opt}`, { indent: 18 });
      });
      y += 6;
      idx++;
    }
  }

  if (subj.length) {
    y += 6;
    writeLine("Section B — Subjective", { size: 13, bold: true });
    y += 4;
    for (const q of subj) {
      writeLine(`${idx}. [${q.topic} • ${q.difficulty}]  ${q.prompt}`, { bold: true });
      y += 60;
      idx++;
    }
  }

  if (withAnswerKey) {
    doc.addPage();
    y = margin;
    writeLine("Answer Key", { size: 16, bold: true });
    y += 6;
    let i = 1;
    for (const q of [...mcqs, ...subj]) {
      if (q.type === "mcq") {
        writeLine(`${i}. ${q.correctAnswer ?? "—"}`);
      } else {
        writeLine(`${i}. Rubric: ${q.rubric ?? "—"}`);
      }
      i++;
    }
  }

  doc.save(`assessment-${(profile.name || "candidate").replace(/\s+/g, "_")}.pdf`);
}
