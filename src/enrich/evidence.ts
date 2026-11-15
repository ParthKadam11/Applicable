import { normalizeWhitespace } from "../classify/text.js";

/**
 * Same rule as eligibility labels: quote must be an exact substring of source text.
 * No quote / not a substring → fact is rejected.
 */
export function quoteIsSubstring(quote: string, sourceText: string): boolean {
  const q = normalizeWhitespace(quote);
  const hay = normalizeWhitespace(sourceText);
  if (!q || q.length < 2 || !hay) return false;
  return hay.includes(q);
}

export function assertFactEvidence(input: {
  quote: string;
  sourceUrl: string;
  sourceText: string;
}): boolean {
  if (!input.sourceUrl?.trim()) return false;
  return quoteIsSubstring(input.quote, input.sourceText);
}

/** Pull a short quote window around a regex match. */
export function quoteAround(
  text: string,
  index: number,
  length: number,
  pad = 40,
): string {
  const start = Math.max(0, index - pad);
  const end = Math.min(text.length, index + length + pad);
  return normalizeWhitespace(text.slice(start, end)).slice(0, 280);
}
