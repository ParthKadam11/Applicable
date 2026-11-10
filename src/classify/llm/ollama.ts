import { config } from "../../config.js";
import { buildClassifyUserPrompt, CLASSIFY_SYSTEM_PROMPT } from "./prompt.js";
import type { LlmClassifyInput, LlmProvider } from "./provider.js";

interface OllamaChatResponse {
  message?: { content?: string };
}

export class OllamaProvider implements LlmProvider {
  readonly name = "ollama" as const;
  readonly model: string;

  constructor(
    private readonly baseUrl: string = config.OLLAMA_URL,
    model: string = config.OLLAMA_MODEL,
  ) {
    this.model = model;
  }

  isConfigured(): boolean {
    return Boolean(this.baseUrl);
  }

  async classify(input: LlmClassifyInput): Promise<unknown> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/api/chat`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": config.USER_AGENT,
      },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        format: "json",
        options: { temperature: 0 },
        messages: [
          { role: "system", content: CLASSIFY_SYSTEM_PROMPT },
          { role: "user", content: buildClassifyUserPrompt(input) },
        ],
      }),
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Ollama HTTP ${res.status}: ${text.slice(0, 300)}`);
    }

    const data = JSON.parse(text) as OllamaChatResponse;
    const content = data.message?.content;
    if (!content) throw new Error("Ollama returned empty content");
    return JSON.parse(content) as unknown;
  }
}
