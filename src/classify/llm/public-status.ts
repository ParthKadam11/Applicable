import { parseLlmProviders } from "../../config.js";
import type { ProviderName } from "./provider.js";
import { buildProvider } from "./rotation.js";
import {
  exhaustedUntilMs,
  getProviderState,
  isExhausted,
  loadLlmState,
} from "./state.js";

const LABELS: Record<ProviderName, string> = {
  groq: "Groq",
  gemini: "Gemini",
  openrouter: "OpenRouter",
  ollama: "Ollama",
};

export type LlmProviderPublicStatus = {
  id: ProviderName;
  label: string;
  model: string;
  /** True when the server has a key / local endpoint for this provider. */
  configured: boolean;
  exhausted: boolean;
  exhausted_until: string | null;
  calls_today: number;
};

export type LlmPublicStatus = {
  mode: "byok";
  summary: string;
  any_ready: boolean;
  providers: LlmProviderPublicStatus[];
};

/** Safe LLM status for the public dashboard (no secrets). */
export function getLlmPublicStatus(): LlmPublicStatus {
  const order = parseLlmProviders();
  const state = loadLlmState();
  const providers: LlmProviderPublicStatus[] = order.map((id) => {
    const p = buildProvider(id);
    const configured = p.isConfigured();
    const entry = getProviderState(state, id);
    const exhausted = configured && isExhausted(id);
    const untilMs = exhaustedUntilMs(id);
    return {
      id,
      label: LABELS[id] ?? id,
      model: p.model,
      configured,
      exhausted,
      exhausted_until:
        exhausted && untilMs != null ? new Date(untilMs).toISOString() : null,
      calls_today: entry.callsToday,
    };
  });

  const anyReady = providers.some((p) => p.configured && !p.exhausted);

  return {
    mode: "byok",
    summary: anyReady
      ? "Unclear roles use your provider keys (BYOK)."
      : "No LLM keys configured. Rules still classify; unclear roles stay unclear until you add BYOK keys.",
    any_ready: anyReady,
    providers,
  };
}
