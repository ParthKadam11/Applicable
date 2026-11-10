import { RotatingLlmProvider, listConfiguredProviders } from "./rotation.js";
import type { LlmProvider } from "./provider.js";

export function createLlmProvider(): LlmProvider | null {
  const providers = listConfiguredProviders();
  if (providers.length === 0) return null;
  return new RotatingLlmProvider(providers);
}

export type { LlmProvider, LlmClassifyInput, ProviderName } from "./provider.js";
export { GroqProvider } from "./groq.js";
export { GeminiProvider } from "./gemini.js";
export { OllamaProvider } from "./ollama.js";
export { OpenRouterProvider } from "./openrouter.js";
export { RotatingLlmProvider, listConfiguredProviders, buildProvider } from "./rotation.js";
export { buildEligibilitySnippet } from "./snippet.js";
export {
  loadLlmState,
  getProviderState,
  isExhausted,
  exhaustedUntilMs,
} from "./state.js";
export { retryAfterMsFromError } from "./errors.js";
