import { config } from "../../config.js";
import { buildClassifyUserPrompt, CLASSIFY_SYSTEM_PROMPT } from "./prompt.js";
import type { LlmClassifyInput, LlmProvider } from "./provider.js";

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
}

export class GeminiProvider implements LlmProvider {
  readonly name = "gemini";
  readonly model: string;

  constructor(
    private readonly apiKey: string = config.GEMINI_API_KEY,
    model: string = config.GEMINI_MODEL,
  ) {
    this.model = model;
  }

  async classify(input: LlmClassifyInput): Promise<unknown> {
    if (!this.apiKey) {
      throw new Error("GEMINI_API_KEY is not set");
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": config.USER_AGENT,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: CLASSIFY_SYSTEM_PROMPT }] },
        contents: [
          {
            role: "user",
            parts: [{ text: buildClassifyUserPrompt(input) }],
          },
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
        },
      }),
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Gemini HTTP ${res.status}: ${text.slice(0, 300)}`);
    }

    const data = JSON.parse(text) as GeminiResponse;
    const content = data.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("");
    if (!content) throw new Error("Gemini returned empty content");
    return JSON.parse(content) as unknown;
  }
}
