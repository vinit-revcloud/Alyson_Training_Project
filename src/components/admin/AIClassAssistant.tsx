import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Sparkles, Upload, Send, Loader2, FileType, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { chatSyllabusBuilder, type ClassSuggestion } from "@/lib/class-ai.functions";
import { extractTextFromFile } from "@/lib/extract-document-text";
import { isReadyToApplyDraft, validateAISyllabusDraft } from "@/lib/class-create.validation";

type ChatMsg = { role: "assistant" | "user"; text: string };

const STARTER_PROMPTS = [
  "Draft a beginner Python class for data analysts",
  "Create a compliance training from my uploaded docs",
  "Make it shorter — 3 sections max",
  "Add a hands-on project section",
];

interface Props {
  onApply: (s: ClassSuggestion) => void;
}

export function AIClassAssistant({ onApply }: Props) {
  const chat = useServerFn(chatSyllabusBuilder);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [files, setFiles] = useState<File[]>([]);
  const [extracted, setExtracted] = useState<Record<string, string>>({});
  const [extracting, setExtracting] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<ClassSuggestion | null>(null);
  const [readyToApply, setReadyToApply] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: "assistant",
      text: "Hi — I'm Alyson. Tell me what training you want to build, or upload reference docs and say \"draft a syllabus from these.\" We can refine it together before applying to the form.",
    },
  ]);

  const sourceMaterial = Object.values(extracted).join("\n\n---\n\n");

  const scrollChat = () => {
    requestAnimationFrame(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }));
  };

  const addFiles = async (incoming: File[]) => {
    if (!incoming.length) return;
    setExtracting(true);
    const accepted: File[] = [];
    const newExtracted: Record<string, string> = {};
    for (const f of incoming) {
      try {
        const text = await extractTextFromFile(f);
        accepted.push(f);
        newExtracted[`${f.name}-${f.size}`] = text;
      } catch (e) {
        toast.error(`Couldn't read ${f.name}`, {
          description: e instanceof Error ? e.message : undefined,
        });
      }
    }
    setFiles((prev) => [...prev, ...accepted]);
    setExtracted((prev) => ({ ...prev, ...newExtracted }));
    setExtracting(false);
    if (accepted.length) {
      setMessages((m) => [
        ...m,
        { role: "user", text: `Uploaded ${accepted.map((f) => f.name).join(", ")}` },
        {
          role: "assistant",
          text: `Parsed ${accepted.length} file${accepted.length === 1 ? "" : "s"}. Describe the audience and goals, or ask me to draft a syllabus from this material.`,
        },
      ]);
      scrollChat();
    }
  };

  const removeFile = (idx: number) => {
    const f = files[idx];
    setFiles((p) => p.filter((_, i) => i !== idx));
    setExtracted((p) => {
      const next = { ...p };
      delete next[`${f.name}-${f.size}`];
      return next;
    });
  };

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    if (!sourceMaterial.trim() && messages.length <= 1 && trimmed.length < 8) {
      toast.error("Add more detail or upload reference material.");
      return;
    }

    const userMsg: ChatMsg = { role: "user", text: trimmed };
    const history = [...messages, userMsg];
    setMessages(history);
    setPrompt("");
    setLoading(true);
    scrollChat();

    try {
      const result = await chat({
        data: {
          messages: history.filter((m) => m.role === "user" || m.role === "assistant"),
          sourceMaterial,
          currentDraft: draft,
        },
      });
      setMessages((m) => [...m, { role: "assistant", text: result.reply }]);
      if (result.draft) setDraft(result.draft);
      setReadyToApply(result.readyToApply);
      scrollChat();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      toast.error("AI request failed", { description: msg });
      setMessages((m) => [...m, { role: "assistant", text: msg }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(prompt);
    }
  };

  const apply = () => {
    if (!draft) return;
    const issues = validateAISyllabusDraft(draft);
    if (issues.length) {
      toast.warning("Draft has gaps", { description: issues[0].message });
    }
    onApply(draft);
    toast.success("Applied AI syllabus to the form below");
    setMessages((m) => [
      ...m,
      {
        role: "assistant",
        text: "Applied — the wizard fields below are pre-filled. Tweak anything you like, then continue through videos and documents.",
      },
    ]);
    scrollChat();
  };

  const canApply = draft ? isReadyToApplyDraft(draft) : false;

  return (
    <Card className="rounded-xl border-border bg-card p-5 shadow-soft">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-primary to-primary-glow text-primary-foreground">
          <Sparkles className="h-4 w-4" />
        </span>
        <div>
          <div className="text-[13px] font-semibold text-foreground">Syllabus Assistant</div>
          <div className="text-[11px] text-muted-foreground">
            Chat to design your full class — DeepSeek with OpenRouter fallback
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border border-border bg-background p-3">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[90%] rounded-lg px-3 py-2 text-[12.5px] leading-relaxed whitespace-pre-wrap ${
                  m.role === "assistant"
                    ? "bg-accent text-foreground"
                    : "ml-auto bg-primary text-primary-foreground"
                }`}
              >
                {m.text}
              </div>
            ))}
            {loading ? (
              <div className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[12.5px] text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
              </div>
            ) : null}
            <div ref={chatEndRef} />
          </div>

          {messages.length <= 2 ? (
            <div className="flex flex-wrap gap-1.5">
              {STARTER_PROMPTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => sendMessage(p)}
                  disabled={loading}
                  className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
                >
                  {p}
                </button>
              ))}
            </div>
          ) : null}

          <div className="rounded-lg border border-border bg-background p-2.5">
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder='Describe your class or ask for changes… (Enter to send, Shift+Enter for new line)'
              className="min-h-[60px] resize-none border-0 bg-transparent p-1 text-[13px] focus-visible:ring-0"
              disabled={loading}
            />
            <div className="mt-1 flex items-center justify-between gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => fileInputRef.current?.click()}
                className="h-8 gap-1.5 text-[12px]"
                disabled={extracting || loading}
              >
                {extracting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                Attach
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.txt,.md"
                multiple
                className="hidden"
                onChange={(e) => {
                  const fs = Array.from(e.target.files ?? []);
                  if (fs.length) addFiles(fs);
                  e.target.value = "";
                }}
              />
              <Button
                size="sm"
                onClick={() => sendMessage(prompt)}
                disabled={loading || extracting || !prompt.trim()}
                className="h-8 gap-1.5 bg-primary text-[12px] text-primary-foreground hover:bg-primary-glow"
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Send
              </Button>
            </div>
          </div>

          {files.length > 0 ? (
            <div className="space-y-1.5">
              {files.map((f, i) => (
                <div
                  key={`${f.name}-${i}`}
                  className="flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 text-[12px]"
                >
                  <FileType className="h-3.5 w-3.5 text-primary" />
                  <span className="flex-1 truncate font-medium text-foreground">{f.name}</span>
                  <span className="text-[10.5px] text-muted-foreground">
                    {Math.ceil((extracted[`${f.name}-${f.size}`]?.length ?? 0) / 1000)}k chars
                  </span>
                  <button onClick={() => removeFile(i)} className="text-muted-foreground hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="rounded-lg border border-dashed border-border bg-background p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Live draft
            </div>
            {readyToApply ? (
              <Badge className="rounded-md bg-emerald-500/15 text-[10px] text-emerald-600">Ready</Badge>
            ) : null}
          </div>
          {draft ? (
            <div className="space-y-2.5 text-[12.5px]">
              <div>
                <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground">Title</div>
                <div className="font-semibold text-foreground">{draft.title || "—"}</div>
              </div>
              {draft.level || draft.audience ? (
                <div className="flex flex-wrap gap-1">
                  {draft.level ? (
                    <Badge variant="outline" className="rounded-md text-[10px]">
                      {draft.level}
                    </Badge>
                  ) : null}
                  {draft.audience ? (
                    <Badge variant="outline" className="rounded-md text-[10px]">
                      {draft.audience}
                    </Badge>
                  ) : null}
                </div>
              ) : null}
              <div>
                <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground">Description</div>
                <div className="text-foreground/90">{draft.description || "—"}</div>
              </div>
              {draft.topics.length > 0 ? (
                <div>
                  <div className="mb-1 text-[10.5px] uppercase tracking-wider text-muted-foreground">Topics</div>
                  <div className="flex flex-wrap gap-1">
                    {draft.topics.map((t) => (
                      <Badge
                        key={t}
                        variant="outline"
                        className="rounded-md border-primary/30 bg-accent text-[10.5px] text-primary"
                      >
                        {t}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}
              <div>
                <div className="mb-1 text-[10.5px] uppercase tracking-wider text-muted-foreground">
                  Sections ({draft.sections.length})
                </div>
                <ul className="max-h-36 space-y-1.5 overflow-y-auto text-[11.5px] text-muted-foreground">
                  {draft.sections.map((s, i) => (
                    <li key={i}>
                      · <span className="font-medium text-foreground">{s.title}</span> · {s.durationMin}m
                      {s.objectives ? (
                        <div className="ml-3 text-[10.5px] text-muted-foreground/80 line-clamp-2">{s.objectives}</div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
              <Button
                onClick={apply}
                size="sm"
                disabled={!canApply}
                className="h-8 w-full gap-1.5 bg-primary text-[12px] text-primary-foreground hover:bg-primary-glow"
              >
                <Check className="h-3.5 w-3.5" /> Apply to form
              </Button>
            </div>
          ) : (
            <div className="text-[11.5px] text-muted-foreground">
              Your syllabus builds here as you chat. Upload docs, describe the training, then refine — e.g. &quot;add a
              quiz section&quot; or &quot;make it beginner level.&quot;
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
