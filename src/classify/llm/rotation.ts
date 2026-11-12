import { parseLlmProviders } from "../../config.js";
import {
  isDailyLimitError,
  isRateLimitError,
  isTransientProviderError,
  retryAfterMsFromError,
} from "./errors.js";
import { GeminiProvider } from "./gemini.js";
import { GroqProvider } from "./groq.js";
import { OllamaProvider } from "./ollama.js";
import { OpenRouterProvider } from "./openrouter.js";
import type {
  LlmClassifyInput,
  LlmProvider,
  ProviderName,
} from "./provider.js";
import {
  earliestResetMs,
  isExhausted,
  markCall,
  markExhausted,
} from "./state.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Process-local: don't retry unreachable providers on every job. */
const sessionDown = new Map<string, number>();

function markSessionDown(name: string, ms = 10 * 60_000): void {
  sessionDown.set(name, Date.now() + ms);
}

function isSessionDown(name: string): boolean {
  const until = sessionDown.get(name);
  if (until == null) return false;
  if (until <= Date.now()) {
    sessionDown.delete(name);
    return false;
  }
  return true;
}

export function buildProvider(name: ProviderName): LlmProvider {
  switch (name) {
    case "ollama":
      return new OllamaProvider();
    case "groq":
      return new GroqProvider();
    case "gemini":
      return new GeminiProvider();
    case "openrouter":
      return new OpenRouterProvider();
  }
}

export function listConfiguredProviders(
  order: ProviderName[] = parseLlmProviders(),
): LlmProvider[] {
  const out: LlmProvider[] = [];
  for (const name of order) {
    const p = buildProvider(name);
    if (p.isConfigured()) out.push(p);
    else console.log(`[classify:llm] skip ${name}: not configured`);
  }
  return out;
}

function isUnreachableError(message: string): boolean {
  return /unreachable|ECONNREFUSED|fetch failed|AbortError|aborted/i.test(
    message,
  );
}

export class RotatingLlmProvider implements LlmProvider {
  readonly name = "rotation";
  readonly model: string;
  private readonly providers: LlmProvider[];

  constructor(providers: LlmProvider[] = listConfiguredProviders()) {
    this.providers = providers;
    this.model =
      providers.map((p) => `${p.name}:${p.model}`).join("|") || "none";
  }

  isConfigured(): boolean {
    return this.providers.length > 0;
  }

  async classify(input: LlmClassifyInput): Promise<unknown> {
    if (this.providers.length === 0) {
      throw new Error("No LLM providers configured");
    }

    const available = this.providers.filter((p) => {
      const name = p.name as ProviderName;
      if (isSessionDown(p.name)) return false;
      if (isExhausted(name)) return false;
      return true;
    });

    if (available.length === 0) {
      const reset = earliestResetMs(
        this.providers.map((p) => p.name as ProviderName),
      );
      // Don't block the queue for ages - leave job unclear.
      if (reset != null && reset > Date.now()) {
        console.warn(
          `[classify:llm] no providers available (next reset ${new Date(reset).toISOString()}) - skipping LLM`,
        );
      } else {
        console.warn(`[classify:llm] no providers available - skipping LLM`);
      }
      throw new Error("ALL_PROVIDERS_EXHAUSTED");
    }

    for (const provider of available) {
      try {
        const raw = await provider.classify(input);
        markCall(provider.name as ProviderName);
        if (raw && typeof raw === "object") {
          (raw as { __provider?: string }).__provider =
            `${provider.name}:${provider.model}`;
        }
        return raw;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(
          `[classify:llm] ${provider.name} failed:`,
          message.slice(0, 280),
        );

        if (isUnreachableError(message)) {
          markSessionDown(provider.name);
          console.warn(
            `[classify:llm] ${provider.name} marked down for 10m (won't retry every job)`,
          );
          continue;
        }

        if (isRateLimitError(message)) {
          const wait = retryAfterMsFromError(message);
          if (isDailyLimitError(message, wait)) {
            const until = Date.now() + (wait ?? 60 * 60_000);
            markExhausted(provider.name as ProviderName, until);
            console.warn(
              `[classify:llm] ${provider.name} daily/TPD exhausted until ${new Date(until).toISOString()} - rotating`,
            );
            continue;
          }
          const rpmWait = Math.min(wait ?? 5_000, 15_000);
          console.warn(
            `[classify:llm] ${provider.name} RPM - waiting ${rpmWait}ms`,
          );
          await sleep(rpmWait);
          try {
            const raw = await provider.classify(input);
            markCall(provider.name as ProviderName);
            if (raw && typeof raw === "object") {
              (raw as { __provider?: string }).__provider =
                `${provider.name}:${provider.model}`;
            }
            return raw;
          } catch (err2) {
            const m2 = err2 instanceof Error ? err2.message : String(err2);
            console.warn(
              `[classify:llm] ${provider.name} retry failed:`,
              m2.slice(0, 200),
            );
            continue;
          }
        }

        if (isTransientProviderError(message)) {
          // One soft retry then move on - don't loop 3 rounds.
          await sleep(500);
          continue;
        }

        // Bad response from this provider - try next.
        continue;
      }
    }

    throw new Error("ALL_PROVIDERS_EXHAUSTED");
  }
}
