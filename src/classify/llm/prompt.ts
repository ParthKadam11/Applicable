import type { LlmClassifyInput } from "./provider.js";

export const CLASSIFY_SYSTEM_PROMPT = `You classify job postings for remote-from-India eligibility.
Return ONLY valid JSON matching this schema:
{
  "india_eligibility": "open" | "region_locked" | "unclear",
  "eligibility_evidence": string[],  // exact verbatim sentences from the posting
  "remote_scope": "worldwide" | "region" | "country" | "onsite" | "hybrid" | "unknown",
  "seniority": "intern" | "junior" | "mid" | "senior" | "staff" | "unknown",
  "role_family": "backend" | "fullstack" | "frontend" | "infra" | "ml" | "other",
  "seniority_evidence": string[],
  "role_family_evidence": string[]
}

Rules:
- Never invent facts. Evidence strings MUST be exact substrings of the posting text.
- india_eligibility "open" ONLY with an explicit sentence allowing India, APAC, worldwide, work from anywhere, any timezone, or global remote.
- Bare "Remote" is NOT open — use "unclear".
- "region_locked" ONLY with an explicit geographic/authorization restriction.
- If no explicit sentence supports a value, use "unclear" / "unknown".
- Temperature is 0; be conservative.`;

export function buildClassifyUserPrompt(input: LlmClassifyInput): string {
  return [
    `Title: ${input.title}`,
    `Location: ${input.locationRaw ?? "(none)"}`,
    `Rules hint: india=${input.rulesHint.india_eligibility}, seniority=${input.rulesHint.seniority}, role_family=${input.rulesHint.role_family}`,
    "",
    "Posting text:",
    // Keep prompts small — Groq free tier is ~8k TPM; long JD dumps cause 429s.
    input.descriptionText.slice(0, 2_500),
  ].join("\n");
}
