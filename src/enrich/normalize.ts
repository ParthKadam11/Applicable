/** Canonical investor aliases (normalized → canonical display name). */
export const INVESTOR_ALIASES: Record<string, string> = {
  "sequoia india": "Peak XV Partners",
  "formerly sequoia india": "Peak XV Partners",
  "peak xv": "Peak XV Partners",
  "peak xv partners": "Peak XV Partners",
  sequoia: "Sequoia Capital",
  "sequoia capital": "Sequoia Capital",
  a16z: "Andreessen Horowitz",
  "andreessen horowitz": "Andreessen Horowitz",
  "accel partners": "Accel",
  accel: "Accel",
  "y combinator": "Y Combinator",
  yc: "Y Combinator",
};

export function normalizeName(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s&]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function canonicalInvestorName(raw: string): {
  name: string;
  normalized: string;
} {
  const normalized = normalizeName(raw);
  const mapped = INVESTOR_ALIASES[normalized];
  if (mapped) {
    return { name: mapped, normalized: normalizeName(mapped) };
  }
  // Title-case lightly for display
  const name = raw.trim().replace(/\s+/g, " ");
  return { name, normalized: normalizeName(name) };
}

export function domainFromWebsite(website: string | null | undefined): string | null {
  if (!website) return null;
  try {
    const u = new URL(website.startsWith("http") ? website : `https://${website}`);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}
