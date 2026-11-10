const NOISE =
  /\b(?:inc|llc|ltd|corp|corporation|company|co|labs?|technologies|technology|software|ai|the)\b/gi;

/** Guess ATS board slugs from a company name and/or domain. */
export function slugGuesses(
  name: string,
  domain?: string | null,
): string[] {
  const out: string[] = [];
  const push = (s: string) => {
    const cleaned = s
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "")
      .replace(/^-+|-+$/g, "");
    if (cleaned.length >= 2 && !out.includes(cleaned)) out.push(cleaned);
  };

  if (domain) {
    const host = domain.toLowerCase().replace(/^www\./, "");
    const base = host.split(".")[0] ?? "";
    push(base);
    push(base.replace(/-/g, ""));
  }

  const raw = name.trim();
  push(raw.replace(/[^a-zA-Z0-9]+/g, ""));
  push(raw.replace(/[^a-zA-Z0-9]+/g, "-"));

  const stripped = raw.replace(NOISE, " ").replace(/\s+/g, " ").trim();
  if (stripped && stripped.toLowerCase() !== raw.toLowerCase()) {
    push(stripped.replace(/[^a-zA-Z0-9]+/g, ""));
    push(stripped.replace(/[^a-zA-Z0-9]+/g, "-"));
  }

  return out.slice(0, 8);
}
