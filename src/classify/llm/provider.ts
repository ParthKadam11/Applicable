import type { LlmClassification } from "../types.js";

export interface LlmClassifyInput {
  title: string;
  descriptionText: string;
  locationRaw?: string | null;
  /** Pre-built eligibility snippet (preferred over full description). */
  snippet?: string;
  rulesHint: {
    india_eligibility: string;
    seniority?: string;
    role_family?: string;
  };
}

export type ProviderName = "ollama" | "groq" | "gemini" | "openrouter";

export interface LlmProvider {
  readonly name: ProviderName | string;
  readonly model: string;
  /** True when the provider has credentials / local endpoint configured. */
  isConfigured(): boolean;
  classify(input: LlmClassifyInput): Promise<unknown>;
}

export type { LlmClassification };
