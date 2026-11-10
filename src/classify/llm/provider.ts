import type { LlmClassification } from "../types.js";

export interface LlmClassifyInput {
  title: string;
  descriptionText: string;
  locationRaw?: string | null;
  rulesHint: {
    india_eligibility: string;
    seniority: string;
    role_family: string;
  };
}

export interface LlmProvider {
  readonly name: string;
  readonly model: string;
  classify(input: LlmClassifyInput): Promise<unknown>;
}

export type { LlmClassification };
