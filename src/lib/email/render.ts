import { marked } from "marked";

export type PlaceholderKey =
  | "learner_name"
  | "course_name"
  | "assignment_name"
  | "due_date"
  | "current_score"
  | "retake_link";

export const PLACEHOLDERS: { key: PlaceholderKey; label: string }[] = [
  { key: "learner_name", label: "Learner name" },
  { key: "course_name", label: "Course name" },
  { key: "assignment_name", label: "Assignment name" },
  { key: "due_date", label: "Due date" },
  { key: "current_score", label: "Current score" },
  { key: "retake_link", label: "Retake / continue link" },
];

export const SAMPLE_VARS: Record<PlaceholderKey, string> = {
  learner_name: "Priya Sharma",
  course_name: "Data Science Foundations",
  assignment_name: "Module 3 · Final Test",
  due_date: "Friday, Dec 12 2025",
  current_score: "54%",
  retake_link: "https://app.alyson.io/attempt/sample",
};

export function substitute(text: string, vars: Partial<Record<PlaceholderKey, string>>): string {
  return text.replace(/\{(\w+)\}/g, (_m, key) => {
    const k = key as PlaceholderKey;
    return vars[k] ?? "";
  });
}

export function findUnknownPlaceholders(text: string): string[] {
  const known = new Set(PLACEHOLDERS.map((p) => p.key as string));
  const out = new Set<string>();
  const re = /\{(\w+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (!known.has(m[1])) out.add(m[1]);
  }
  return [...out];
}

marked.setOptions({ gfm: true, breaks: true });

const BRAND = {
  primary: "#3B82F6",
  text: "#0F172A",
  muted: "#6B7280",
  border: "#E5E7EB",
  bg: "#ffffff",
  surface: "#F8FAFC",
};

export function wrapBrandLayout(opts: {
  subject: string;
  innerHtml: string;
  preheader?: string;
}): string {
  const { subject, innerHtml, preheader } = opts;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:${BRAND.surface};font-family:Inter,Arial,sans-serif;color:${BRAND.text};">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.surface};padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${BRAND.bg};border:1px solid ${BRAND.border};border-radius:12px;overflow:hidden;">
      <tr><td style="padding:20px 24px;border-bottom:1px solid ${BRAND.border};">
        <div style="font-size:14px;font-weight:600;letter-spacing:-0.01em;color:${BRAND.text};">Alyson Training</div>
      </td></tr>
      <tr><td style="padding:24px;font-size:14px;line-height:1.6;color:${BRAND.text};">
        ${innerHtml}
      </td></tr>
      <tr><td style="padding:16px 24px;border-top:1px solid ${BRAND.border};font-size:11px;color:${BRAND.muted};">
        Sent by Alyson Training · training.group@cintara.ai
      </td></tr>
    </table>
  </td></tr>
</table></body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

export function renderTemplate(opts: {
  subject: string;
  bodyMd: string;
  vars: Partial<Record<PlaceholderKey, string>>;
}): { subject: string; html: string } {
  const subject = substitute(opts.subject, opts.vars);
  const bodyWithVars = substitute(opts.bodyMd, opts.vars);
  const inner = marked.parse(bodyWithVars, { async: false }) as string;
  const html = wrapBrandLayout({ subject, innerHtml: inner, preheader: subject });
  return { subject, html };
}
