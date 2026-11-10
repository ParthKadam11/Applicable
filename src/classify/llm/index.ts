import { config } from "../../config.js";
import { GeminiProvider } from "./gemini.js";
import { GroqProvider } from "./groq.js";
import type { LlmProvider } from "./provider.js";

export function createLlmProvider(
  providerName: "groq" | "gemini" = config.LLM_PROVIDER,
): LlmProvider | null {
  if (providerName === "groq") {
    if (!config.GROQ_API_KEY) return null;
    return new GroqProvider();
  }
  if (!config.GEMINI_API_KEY) return null;
  return new GeminiProvider();
}

export type { LlmProvider, LlmClassifyInput } from "./provider.js";
export { GroqProvider } from "./groq.js";
export { GeminiProvider } from "./gemini.js";
