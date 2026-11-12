import { z } from "zod";

export const EligibilityFilterSchema = z.enum([
  "open",
  "india_remote",
  "india_onsite",
  "region_locked",
  "unclear",
]);

/** Matches backend AiSearchFilterSchema / SearchJobsInputSchema (no cursor). */
export const AiSearchFilterSchema = z.object({
  query: z.string().min(1).optional(),
  eligibility: z
    .array(EligibilityFilterSchema)
    .min(1)
    .default(["open", "india_remote"]),
  role_keywords: z.string().min(1).optional(),
  company: z.string().min(1).optional(),
  posted_within_days: z.number().int().positive().max(365).optional(),
  limit: z.number().int().min(1).max(50).default(25),
});

export type AiSearchFilter = z.infer<typeof AiSearchFilterSchema>;

export type ByokProvider = "gemini" | "groq" | "openai";

export type ByokKeyStore = {
  provider: ByokProvider;
  apiKey: string;
};

const STORAGE_KEY = "applicable.byok.ai-search";

export function loadByokKey(): ByokKeyStore | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ByokKeyStore;
    if (
      !parsed?.apiKey ||
      !["gemini", "groq", "openai"].includes(parsed.provider)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveByokKey(store: ByokKeyStore): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function clearByokKey(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}

const SYSTEM = `You convert a natural-language job search into JSON filters for Applicable.
Return ONLY a JSON object with optional keys:
query (string), eligibility (array of open|india_remote|india_onsite|region_locked|unclear),
role_keywords (string), company (string), posted_within_days (1-365), limit (1-50).
Default eligibility to ["open","india_remote"] when unclear. Prefer India-remote friendly searches.
No markdown, no commentary.`;

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(trimmed);
  const body = fence?.[1]?.trim() ?? trimmed;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no_json");
  return JSON.parse(body.slice(start, end + 1));
}

async function callGemini(apiKey: string, prompt: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: `${SYSTEM}\n\nUser: ${prompt}` }] }],
      generationConfig: { temperature: 0.1 },
    }),
  });
  if (!res.ok) throw new Error(`gemini_http_${res.status}`);
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("gemini_empty");
  return text;
}

async function callOpenAiCompatible(
  baseUrl: string,
  apiKey: string,
  model: string,
  prompt: string,
): Promise<string> {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`llm_http_${res.status}`);
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("llm_empty");
  return text;
}

export async function nlToFilters(
  prompt: string,
  store: ByokKeyStore,
): Promise<AiSearchFilter> {
  let text: string;
  if (store.provider === "gemini") {
    text = await callGemini(store.apiKey, prompt);
  } else if (store.provider === "groq") {
    text = await callOpenAiCompatible(
      "https://api.groq.com/openai/v1",
      store.apiKey,
      "llama-3.3-70b-versatile",
      prompt,
    );
  } else {
    text = await callOpenAiCompatible(
      "https://api.openai.com/v1",
      store.apiKey,
      "gpt-4o-mini",
      prompt,
    );
  }
  const raw = extractJsonObject(text);
  return AiSearchFilterSchema.parse(raw);
}

export function filtersToJobsQuery(f: AiSearchFilter): string {
  const sp = new URLSearchParams();
  if (f.query) sp.set("query", f.query);
  if (f.role_keywords) sp.set("role_keywords", f.role_keywords);
  if (f.company) sp.set("company", f.company);
  if (f.posted_within_days != null) {
    sp.set("posted_within_days", String(f.posted_within_days));
  }
  sp.set("eligibility", f.eligibility.join(","));
  sp.set("limit", String(f.limit ?? 25));
  return sp.toString();
}
