/** Collapse whitespace for evidence substring checks. */
export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Split description into sentences (keeps trailing punctuation on the sentence). */
export function splitSentences(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const parts = normalized.split(/(?<=[.!?])\s+|\n+/);
  return parts.map((s) => s.trim()).filter(Boolean);
}

/** Find the first sentence containing a regex match (case-insensitive). */
export function sentenceMatching(
  text: string,
  pattern: RegExp,
): string | null {
  const flags = pattern.flags.includes("i") ? pattern.flags : `${pattern.flags}i`;
  const re = new RegExp(pattern.source, flags);
  for (const sentence of splitSentences(text)) {
    if (re.test(sentence)) return sentence;
  }
  // Fall back to a window around the match in the full text
  const full = new RegExp(pattern.source, flags);
  const m = full.exec(text);
  if (!m || m.index === undefined) return null;
  const start = Math.max(0, text.lastIndexOf(".", m.index) + 1);
  const endCandidates = [".", "!", "?", "\n"]
    .map((ch) => text.indexOf(ch, m.index + m[0].length))
    .filter((i) => i >= 0);
  const end =
    endCandidates.length > 0
      ? Math.min(...endCandidates) + 1
      : Math.min(text.length, m.index + m[0].length + 120);
  return text.slice(start, end).trim() || m[0];
}

export function combineTitleAndDescription(
  title: string,
  descriptionText: string,
  locationRaw?: string | null,
): string {
  const parts = [title];
  if (locationRaw) parts.push(`Location: ${locationRaw}`);
  if (descriptionText) parts.push(descriptionText);
  return parts.join("\n\n");
}
