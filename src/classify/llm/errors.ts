/** Parse Groq/Gemini/OpenRouter retry hints: "6m53.424s", "16m7.68s", "7.2s". */
export function retryAfterMsFromError(message: string): number | null {
  const compound = message.match(
    /try again in\s+(?:(\d+(?:\.\d+)?)h)?\s*(?:(\d+(?:\.\d+)?)m)?\s*(?:(\d+(?:\.\d+)?)s)?/i,
  );
  if (compound && (compound[1] || compound[2] || compound[3])) {
    const hours = Number(compound[1] ?? 0);
    const mins = Number(compound[2] ?? 0);
    const secs = Number(compound[3] ?? 0);
    const total = Math.ceil((hours * 3600 + mins * 60 + secs) * 1000) + 250;
    if (total > 250) return total;
  }
  const msOnly = message.match(/try again in\s+(\d+(?:\.\d+)?)\s*ms/i);
  if (msOnly?.[1]) return Math.ceil(Number(msOnly[1])) + 250;
  return null;
}

const DAILY_HINT =
  /\b(?:TPD|tokens per day|daily|per day|quota|exhausted|billing|limit.*day)\b/i;

/** Daily/TPD-style limit → rotate providers. Per-minute → wait same provider. */
export function isDailyLimitError(message: string, waitMs: number | null): boolean {
  if (DAILY_HINT.test(message)) return true;
  // Long waits (>5 min) are treated as daily/exhaustion windows.
  if (waitMs != null && waitMs >= 5 * 60_000) return true;
  return false;
}

export function isRateLimitError(message: string): boolean {
  return /\b429\b|rate limit|quota|RESOURCE_EXHAUSTED/i.test(message);
}

export function isTransientProviderError(message: string): boolean {
  return /\b503\b|\bUNAVAILABLE\b|high demand|overloaded|ECONNREFUSED|fetch failed/i.test(
    message,
  );
}
