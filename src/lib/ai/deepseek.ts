/** @deprecated Import from @/lib/ai/llm instead. Re-exports for existing call sites. */
export type { ChatMessage, DeepSeekMessage, LlmChatOptions } from "./llm";
export { llmChat as deepseekChat, llmChatCompletion as deepseekChatCompletion } from "./llm";
