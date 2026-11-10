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
- Prefer the Location field: non-India geo (US, EMEA, Europe, London, …) => region_locked with location as evidence; Anywhere/Worldwide/Global/India/APAC => open candidate.
- india_eligibility evidence MUST be about who can apply / where the worker may work — NOT company marketing ("worldwide team", "customers in 100 countries", "we're distributed").
- Bare "Remote" is NOT open — use "unclear".
- "region_locked" ONLY with an explicit geographic/authorization restriction.
- If no explicit applicant-eligibility sentence supports a value, use "unclear" / "unknown".
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
