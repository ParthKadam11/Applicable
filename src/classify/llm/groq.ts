import { config } from "../../config.js";
import { buildClassifyUserPrompt, CLASSIFY_SYSTEM_PROMPT } from "./prompt.js";
import type { LlmClassifyInput, LlmProvider } from "./provider.js";

interface GroqChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

export class GroqProvider implements LlmProvider {
  readonly name = "groq";
  readonly model: string;

  constructor(
    private readonly apiKey: string = config.GROQ_API_KEY,
    model: string = config.GROQ_MODEL,
  ) {
    this.model = model;
  }

  async classify(input: LlmClassifyInput): Promise<unknown> {
    if (!this.apiKey) {
      throw new Error("GROQ_API_KEY is not set");
    }

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "User-Agent": config.USER_AGENT,
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
      throw new Error(`Groq HTTP ${res.status}: ${text.slice(0, 300)}`);
    }

    const data = JSON.parse(text) as GroqChatResponse;
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("Groq returned empty content");
    return JSON.parse(content) as unknown;
  }
}
