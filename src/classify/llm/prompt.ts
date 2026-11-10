import type { LlmClassifyInput } from "./provider.js";
import { buildEligibilitySnippet } from "./snippet.js";

export const CLASSIFY_SYSTEM_PROMPT = `Classify India remote eligibility for a job posting.
Return ONLY JSON:
{
  "india_eligibility": "open" | "india_remote" | "india_onsite" | "region_locked" | "unclear",
  "eligibility_evidence": string[],
  "remote_scope": "worldwide" | "region" | "country" | "onsite" | "hybrid" | "unknown"
}

Rules:
- Evidence MUST be exact substrings of the snippet.
- open = worldwide / work-from-anywhere / contractor-EOR with no geo lock.
- india_remote = India allowed and remote; india_onsite = India city, no remote.
- region_locked = explicit US/UK/EU/etc restriction or auth requirement.
- Remote APAC/EMEA without India = unclear (not open).
- Bare "Remote" = unclear. Never invent facts.`;

export function buildClassifyUserPrompt(input: LlmClassifyInput): string {
  const snippet =
    input.snippet ??
    buildEligibilitySnippet({
      title: input.title,
      descriptionText: input.descriptionText,
      locationRaw: input.locationRaw,
    });

  return [
    snippet,
    "",
    `Rules hint: india=${input.rulesHint.india_eligibility}`,
  ].join("\n");
}
