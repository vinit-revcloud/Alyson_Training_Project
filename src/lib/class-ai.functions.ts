import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireContentManager } from "@/integrations/neon/auth-middleware";
import { deepseekChat, type DeepSeekMessage } from "@/lib/ai/deepseek";
import { isReadyToApplyDraft } from "@/lib/class-create.validation";

const LevelSchema = z.enum(["Beginner", "Intermediate", "Advanced"]);

const SectionSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  durationMin: z.number().optional(),
  objectives: z.string().optional(),
});

const DraftSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  topics: z.array(z.string()).optional(),
  sections: z.array(SectionSchema).optional(),
  level: LevelSchema.optional(),
  audience: z.string().optional(),
  parentCourse: z.string().optional(),
});

const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().max(4000),
});

const ChatInputSchema = z.object({
  messages: z.array(MessageSchema).max(40),
  sourceMaterial: z.string().max(120_000).default(""),
  currentDraft: DraftSchema.nullable().optional(),
});

export interface ClassSectionSuggestion {
  title: string;
  description: string;
  durationMin: number;
  objectives: string;
}

export interface ClassSuggestion {
  title: string;
  description: string;
  topics: string[];
  sections: ClassSectionSuggestion[];
  level?: "Beginner" | "Intermediate" | "Advanced";
  audience?: string;
  parentCourse?: string;
  notes?: string;
}

export interface SyllabusChatResponse {
  reply: string;
  draft: ClassSuggestion | null;
  readyToApply: boolean;
}

const SYLLABUS_SYSTEM_PROMPT = `You are Alyson, an expert instructional designer for Cintara's corporate LMS.

Your job is to help an admin design a complete training class syllabus through natural conversation. You may receive uploaded reference documents (PDFs, manuals, policies) as source material.

WORKFLOW:
1. If the admin's goal is unclear, ask 1-2 focused questions (audience, duration, skill level, department).
2. Once you have enough context, propose a structured syllabus draft.
3. Refine the draft when the admin asks (add/remove sections, change difficulty, rename, adjust durations).
4. When the syllabus looks complete, set readyToApply to true and tell them they can apply it to the form.

Always respond with STRICT JSON only (no markdown fences):
{
  "reply": "conversational message to the admin (markdown ok inside string)",
  "draft": {
    "title": "string",
    "description": "1-2 learner-facing sentences",
    "topics": ["tag1", "tag2"],
    "level": "Beginner" | "Intermediate" | "Advanced",
    "audience": "department/role e.g. Data Scientist",
    "parentCourse": "course name this class belongs under",
    "sections": [
      {
        "title": "section title",
        "description": "what this lesson covers",
        "durationMin": 15,
        "objectives": "bullet-style learning outcomes"
      }
    ]
  },
  "readyToApply": false
}

RULES:
- title: 4-10 words, specific
- topics: 4-10 short tags
- sections: 3-8 lessons, progressive order, 10-45 min each
- objectives: concrete, measurable outcomes per section
- Keep draft updated every turn once you have context (merge refinements into full draft)
- reply should be warm, concise, and reference what changed
- readyToApply: true only when draft has title, description, topics, and at least 3 sections
- Use source material when provided; don't invent facts that contradict it`;

function normalizeDraft(raw: z.infer<typeof DraftSchema> | null | undefined): ClassSuggestion | null {
  if (!raw) return null;
  const title = String(raw.title ?? "").trim();
  const description = String(raw.description ?? "").trim();
  const topics = Array.isArray(raw.topics)
    ? raw.topics.map((t) => String(t).trim()).filter(Boolean).slice(0, 12)
    : [];
  const sections = Array.isArray(raw.sections)
    ? raw.sections
        .map((s) => ({
          title: String(s?.title ?? "").trim(),
          description: String(s?.description ?? "").trim(),
          durationMin:
            Number(s?.durationMin) > 0
              ? Math.min(180, Math.floor(Number(s.durationMin)))
              : 15,
          objectives: String(s?.objectives ?? "").trim(),
        }))
        .filter((s) => s.title)
        .slice(0, 10)
    : [];

  if (!title && !description && topics.length === 0 && sections.length === 0) {
    return null;
  }

  return {
    title,
    description,
    topics,
    sections,
    level: raw.level,
    audience: raw.audience ? String(raw.audience).trim() : undefined,
    parentCourse: raw.parentCourse ? String(raw.parentCourse).trim() : undefined,
  };
}

function parseChatResponse(content: string): SyllabusChatResponse {
  let parsed: Record<string, unknown> = {};
  const trimmed = content.trim();
  if (!trimmed) {
    return {
      reply: "The AI returned an empty response. Please try again.",
      draft: null,
      readyToApply: false,
    };
  }
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    const m = trimmed.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        parsed = JSON.parse(m[0]);
      } catch {
        return {
          reply: trimmed.slice(0, 2000),
          draft: null,
          readyToApply: false,
        };
      }
    } else {
      return {
        reply: trimmed.slice(0, 2000),
        draft: null,
        readyToApply: false,
      };
    }
  }

  const draft = normalizeDraft(parsed.draft as z.infer<typeof DraftSchema>);
  const reply = String(parsed.reply ?? parsed.notes ?? "I've updated the syllabus draft.").trim();
  const readyToApply =
    Boolean(parsed.readyToApply) && isReadyToApplyDraft(draft ?? { title: "", sections: [] });

  return { reply: reply.slice(0, 2000), draft, readyToApply };
}

function buildDeepSeekMessages(input: z.infer<typeof ChatInputSchema>): DeepSeekMessage[] {
  const messages: DeepSeekMessage[] = [{ role: "system", content: SYLLABUS_SYSTEM_PROMPT }];

  if (input.sourceMaterial.trim()) {
    messages.push({
      role: "user",
      content: `Reference documents uploaded by the admin (use as primary source):\n\n${input.sourceMaterial.slice(0, 80_000)}`,
    });
    messages.push({
      role: "assistant",
      content:
        "I've read the reference material. Tell me who this class is for and what outcomes you want — or say \"draft a syllabus\" and I'll propose one.",
    });
  }

  if (input.currentDraft) {
    messages.push({
      role: "user",
      content: `Current syllabus draft on the canvas:\n${JSON.stringify(input.currentDraft, null, 2)}`,
    });
    messages.push({
      role: "assistant",
      content: "I have the current draft. I'll refine it based on your next message.",
    });
  }

  for (const msg of input.messages) {
    messages.push({
      role: msg.role,
      content: msg.text,
    });
  }

  return messages;
}

async function runSyllabusChat(input: z.infer<typeof ChatInputSchema>): Promise<SyllabusChatResponse> {
  const messages = buildDeepSeekMessages(input);
  const content = await deepseekChat({
    messages,
    jsonMode: true,
    maxTokens: 4096,
  });
  return parseChatResponse(content);
}

/** Conversational syllabus builder — multi-turn DeepSeek chat. */
export const chatSyllabusBuilder = createServerFn({ method: "POST" })
  .middleware([requireContentManager])
  .inputValidator((data: unknown) => ChatInputSchema.parse(data))
  .handler(async ({ data }): Promise<SyllabusChatResponse> => runSyllabusChat(data));
