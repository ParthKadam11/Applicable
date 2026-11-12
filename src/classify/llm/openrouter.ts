import { config } from "../../config.js";
import { buildClassifyUserPrompt, CLASSIFY_SYSTEM_PROMPT } from "./prompt.js";
import type { LlmClassifyInput, LlmProvider } from "./provider.js";

interface OpenRouterChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

export class OpenRouterProvider implements LlmProvider {
  readonly name = "openrouter" as const;
  readonly model: string;

  constructor(
    private readonly apiKey: string = config.OPENROUTER_API_KEY,
    model: string = config.OPENROUTER_MODEL,
  ) {
    this.model = model;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async classify(input: LlmClassifyInput): Promise<unknown> {
    if (!this.apiKey) throw new Error("OPENROUTER_API_KEY is not set");

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "User-Agent": config.USER_AGENT,
        "HTTP-Referer": "https://github.com/ParthKadam11/Applicable",
        "X-Title": "Applicable",
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: CLASSIFY_SYSTEM_PROMPT },
          { role: "user", content: buildClassifyUserPrompt(input) },
        ],
      }),
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`OpenRouter HTTP ${res.status}: ${text.slice(0, 300)}`);
    }

    const data = JSON.parse(text) as OpenRouterChatResponse;
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("OpenRouter returned empty content");
    return JSON.parse(content) as unknown;
  }
}
