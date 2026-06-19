import {
  getAppBaseUrl,
  getDeepSeekApiKey,
  getOpenRouterApiKey,
  getOpenRouterModel,
  getOpenRouterVisionModel,
} from "@/lib/config.server";
import { logAiUsage } from "@/lib/ai-usage.server";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

/** @deprecated Use ChatMessage */
export type DeepSeekMessage = ChatMessage;

export type LlmChatOptions = {
  messages: ChatMessage[];
  jsonMode?: boolean;
  maxTokens?: number;
  /** For usage logging */
  userId?: string;
  feature?: string;
};

const LLM_TIMEOUT_MS = 45_000;

type ProviderResult =
  | { ok: true; content: string }
  | { ok: false; status: number; body: string; fallbackEligible: boolean };

const DEEPSEEK_FALLBACK_STATUSES = new Set([401, 402, 403, 404, 429, 500, 502, 503]);

function extractContent(json: unknown): string {
  const root = json as { choices?: { message?: { content?: string } }[] };
  return root.choices?.[0]?.message?.content ?? "";
}

async function callDeepSeek(messages: ChatMessage[], opts?: LlmChatOptions): Promise<ProviderResult> {
  const apiKey = getDeepSeekApiKey();
  if (!apiKey) {
    return { ok: false, status: 0, body: "DEEPSEEK_API_KEY not configured", fallbackEligible: true };
  }

  try {
    const res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages,
        ...(opts?.jsonMode ? { response_format: { type: "json_object" } } : {}),
        max_tokens: opts?.maxTokens ?? 8192,
        temperature: 0.4,
      }),
      signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
    });

    if (!res.ok) {
      const body = await res.text();
      return {
        ok: false,
        status: res.status,
        body,
        fallbackEligible: DEEPSEEK_FALLBACK_STATUSES.has(res.status),
      };
    }

    return { ok: true, content: extractContent(await res.json()) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 0, body: message, fallbackEligible: true };
  }
}

async function callOpenRouter(messages: ChatMessage[], opts?: LlmChatOptions): Promise<ProviderResult> {
  const apiKey = getOpenRouterApiKey();
  if (!apiKey) {
    return { ok: false, status: 0, body: "OPENROUTER_API_KEY not configured", fallbackEligible: false };
  }

  const appUrl = getAppBaseUrl();

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": appUrl,
        "X-Title": "Alyson Training",
      },
      body: JSON.stringify({
        model: getOpenRouterModel(),
        messages,
        ...(opts?.jsonMode ? { response_format: { type: "json_object" } } : {}),
        max_tokens: opts?.maxTokens ?? 8192,
        temperature: 0.4,
      }),
      signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
    });

    if (!res.ok) {
      const body = await res.text();
      return { ok: false, status: res.status, body, fallbackEligible: false };
    }

    return { ok: true, content: extractContent(await res.json()) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 0, body: message, fallbackEligible: false };
  }
}

function providerError(provider: "DeepSeek" | "OpenRouter", status: number, body: string): Error {
  if (provider === "DeepSeek" && status === 401) {
    return new Error("DeepSeek API key is invalid.");
  }
  if (provider === "DeepSeek" && status === 402) {
    return new Error("DeepSeek account balance is empty.");
  }
  if (provider === "OpenRouter" && status === 401) {
    return new Error("OpenRouter API key is invalid. Check OPENROUTER_API_KEY in .env.");
  }
  if (provider === "OpenRouter" && status === 402) {
    return new Error("OpenRouter account balance is empty. Top up at openrouter.ai.");
  }
  if (status === 429) {
    return new Error("AI rate limit reached. Try again shortly.");
  }
  const detail = body.slice(0, 300);
  return new Error(
    status > 0 ? `${provider} error ${status}: ${detail}` : `${provider} request failed: ${detail}`,
  );
}

/** Chat completion with DeepSeek primary and OpenRouter fallback. */
export async function llmChat(opts: LlmChatOptions): Promise<string> {
  const started = Date.now();
  const deepseek = await callDeepSeek(opts.messages, opts);
  if (deepseek.ok) {
    void logAiUsage({
      userId: opts.userId,
      feature: opts.feature ?? "llm-chat",
      model: "deepseek-chat",
      durationMs: Date.now() - started,
      tokensIn: Math.ceil(opts.messages.map((m) => m.content.length).reduce((a, b) => a + b, 0) / 4),
      tokensOut: Math.ceil(deepseek.content.length / 4),
    });
    return deepseek.content;
  }

  const openRouterKey = getOpenRouterApiKey();
  if (deepseek.fallbackEligible && openRouterKey) {
    console.warn(
      `[llm] DeepSeek unavailable (${deepseek.status || "network"}), falling back to OpenRouter`,
    );
    const openRouter = await callOpenRouter(opts.messages, opts);
    if (openRouter.ok) {
      void logAiUsage({
        userId: opts.userId,
        feature: opts.feature ?? "llm-chat",
        model: getOpenRouterModel(),
        durationMs: Date.now() - started,
        tokensIn: Math.ceil(opts.messages.map((m) => m.content.length).reduce((a, b) => a + b, 0) / 4),
        tokensOut: Math.ceil(openRouter.content.length / 4),
      });
      return openRouter.content;
    }
    throw providerError("OpenRouter", openRouter.status, openRouter.body);
  }

  if (!getDeepSeekApiKey() && openRouterKey) {
    const openRouter = await callOpenRouter(opts.messages, opts);
    if (openRouter.ok) {
      void logAiUsage({
        userId: opts.userId,
        feature: opts.feature ?? "llm-chat",
        model: getOpenRouterModel(),
        durationMs: Date.now() - started,
        tokensIn: Math.ceil(opts.messages.map((m) => m.content.length).reduce((a, b) => a + b, 0) / 4),
        tokensOut: Math.ceil(openRouter.content.length / 4),
      });
      return openRouter.content;
    }
    throw providerError("OpenRouter", openRouter.status, openRouter.body);
  }

  throw providerError("DeepSeek", deepseek.status, deepseek.body);
}

/** Single-turn helper. */
export async function llmChatCompletion(opts: {
  system: string;
  user: string;
  jsonMode?: boolean;
  maxTokens?: number;
}): Promise<string> {
  return llmChat({
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
    jsonMode: opts.jsonMode,
    maxTokens: opts.maxTokens,
  });
}

export type VisionImage = { mime: string; base64: string };

/** Vision grading via OpenRouter (paper test photos). */
export async function llmVisionCompletion(opts: {
  system: string;
  userText: string;
  images: VisionImage[];
  jsonMode?: boolean;
  maxTokens?: number;
}): Promise<string> {
  const apiKey = getOpenRouterApiKey();
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY required for paper test image grading.");
  }

  const appUrl = getAppBaseUrl();
  const model = getOpenRouterVisionModel();

  const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
    { type: "text", text: opts.userText },
    ...opts.images.map((img) => ({
      type: "image_url",
      image_url: { url: `data:${img.mime};base64,${img.base64}` },
    })),
  ];

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": appUrl,
      "X-Title": "Alyson Training",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content },
      ],
      ...(opts.jsonMode ? { response_format: { type: "json_object" } } : {}),
      max_tokens: opts.maxTokens ?? 4096,
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenRouter vision error ${res.status}: ${body.slice(0, 300)}`);
  }

  return extractContent(await res.json());
}

function sanitizeEnvKey(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  return trimmed.replace(/^["']|["']$/g, "").trim() || undefined;
}
