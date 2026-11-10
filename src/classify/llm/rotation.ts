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

    let round = 0;
    while (round < 3) {
      round += 1;
      const available = this.providers.filter(
        (p) => !isExhausted(p.name as ProviderName),
      );

      if (available.length === 0) {
        const reset = earliestResetMs(
          this.providers.map((p) => p.name as ProviderName),
        );
        if (reset == null) {
          throw new Error("ALL_PROVIDERS_EXHAUSTED");
        }
        const wait = Math.max(1_000, Math.min(reset - Date.now(), 15 * 60_000));
        console.warn(
          `[classify:llm] all providers exhausted — pausing ${wait}ms until earliest reset`,
        );
        await sleep(wait);
        continue;
      }

      let transientHits = 0;

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

          if (isRateLimitError(message)) {
            const wait = retryAfterMsFromError(message);
            if (isDailyLimitError(message, wait)) {
              const until = Date.now() + (wait ?? 60 * 60_000);
              markExhausted(provider.name as ProviderName, until);
              console.warn(
                `[classify:llm] ${provider.name} daily/TPD exhausted until ${new Date(until).toISOString()} — rotating`,
              );
              continue;
            }
            const rpmWait = wait ?? 5_000;
            console.warn(
              `[classify:llm] ${provider.name} RPM — waiting ${rpmWait}ms`,
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
            transientHits += 1;
            await sleep(750);
            continue;
          }

          // Non-transient (bad JSON from provider HTTP 200 path is thrown by parse upstream).
          throw err;
        }
      }

      if (transientHits >= available.length) {
        console.warn(
          `[classify:llm] all available providers transient-failed (round ${round})`,
        );
        await sleep(1_000 * round);
        continue;
      }
    }

    throw new Error("ALL_PROVIDERS_EXHAUSTED");
  }
}
