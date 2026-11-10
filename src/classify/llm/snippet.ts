import { splitSentences } from "../text.js";

const SNIPPET_KEYWORDS =
  /\b(?:remote|location|based|eligible|eligibility|authorization|authorized|timezone|time zone|hire|hiring|country|countries|reside|residents?|relocate|visa|contractor|Deel|Oyster|EOR|worldwide|anywhere|global|India|IST)\b/i;

const MAX_CHARS = 1_500;

/**
 * Tiny eligibility snippet for LLM — never the full description.
 * title + location_raw + matching sentences, capped ~1500 chars.
 */
export function buildEligibilitySnippet(input: {
  title: string;
  descriptionText: string;
  locationRaw?: string | null;
}): string {
  const parts: string[] = [`Title: ${input.title}`];
  if (input.locationRaw?.trim()) {
    parts.push(`Location: ${input.locationRaw.trim()}`);
  }

  const matched: string[] = [];
  for (const sentence of splitSentences(input.descriptionText)) {
    if (SNIPPET_KEYWORDS.test(sentence)) matched.push(sentence);
  }

  let body = matched.join(" ");
  if (!body.trim()) {
    // Fallback: first ~400 chars so the model has something.
    body = input.descriptionText.slice(0, 400);
  }

  let out = [...parts, "", body].join("\n");
  if (out.length > MAX_CHARS) {
    out = `${out.slice(0, MAX_CHARS - 1)}…`;
  }
  return out;
}
