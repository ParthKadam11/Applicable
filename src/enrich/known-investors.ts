import { normalizeName } from "./normalize.js";

/**
 * Seed list of proper-noun investor orgs. Matched case-insensitively after
 * normalizeName. Extended at runtime from yc-oss batch partners when present.
 */
export const COMMON_VCS: string[] = [
  "Y Combinator",
  "YC",
  "Sequoia Capital",
  "Sequoia",
  "Sequoia India",
  "Peak XV Partners",
  "Peak XV",
  "Accel",
  "Accel Partners",
  "Andreessen Horowitz",
  "a16z",
  "Benchmark",
  "Greylock",
  "Greylock Partners",
  "Kleiner Perkins",
  "Index Ventures",
  "Lightspeed",
  "Lightspeed Venture Partners",
  "Bessemer",
  "Bessemer Venture Partners",
  "General Catalyst",
  "Founders Fund",
  "Khosla Ventures",
  "Bain Capital Ventures",
  "Initialized",
  "Initialized Capital",
  "BoxGroup",
  "Altos Ventures",
  "Alven Capital",
  "Alven",
  "Point Nine Capital",
  "Point Nine",
  "Storm Ventures",
  "First Round",
  "First Round Capital",
  "SoftBank",
  "Tiger Global",
  "Coatue",
  "Insight Partners",
  "GV",
  "Google Ventures",
  "Microsoft Ventures",
  "M12",
  "Salesforce Ventures",
  "Spark Capital",
  "Redpoint",
  "Redpoint Ventures",
  "NEA",
  "New Enterprise Associates",
  "Battery Ventures",
  "Thrive Capital",
  "Ribbit Capital",
  "Felícis",
  "Felicis",
  "Felicis Ventures",
  "Unusual Ventures",
  "Craft Ventures",
  "Cowboy Ventures",
  "Homebrew",
  "Floodgate",
  "Lowercase Capital",
  "Union Square Ventures",
  "USV",
  "Slow Ventures",
  "Matrix Partners",
  "Matrix",
  "CRV",
  "Charles River Ventures",
  "Menlo Ventures",
  "Norwest",
  "Norwest Venture Partners",
  "IVP",
  "Institutional Venture Partners",
  "DST Global",
  "Goodwater Capital",
  "Goodwater",
  "Pear VC",
  "Pear",
  "Soma Capital",
  "Liquid 2 Ventures",
  "Pioneer Fund",
  "Rebel Fund",
  "A Capital",
  "Abstract Ventures",
  "Draper Associates",
  "500 Global",
  "500 Startups",
  "Techstars",
  "Antler",
  "Entrepreneur First",
  "EF",
  "Notable Capital",
  "GSV Ventures",
  "Amplify Partners",
  "Essence VC",
  "Altos Ventures",
  "Picus Capital",
];

const PROSE_BLOCKLIST = new Set(
  [
    "world-class investors",
    "top investors",
    "top-tier investors",
    "leading investors",
    "top vcs",
    "investors",
    "angels",
    "venture capital",
    "our investors",
    "industry leaders",
  ].map(normalizeName),
);

let knownNormalized = new Set(COMMON_VCS.map(normalizeName));
const displayByNorm = new Map(
  COMMON_VCS.map((n) => [normalizeName(n), n] as const),
);

export function addKnownInvestors(names: string[]): void {
  for (const n of names) {
    const t = n.trim();
    if (t.length < 2 || t.length > 60) continue;
    const norm = normalizeName(t);
    if (!norm || PROSE_BLOCKLIST.has(norm)) continue;
    knownNormalized.add(norm);
    if (!displayByNorm.has(norm)) displayByNorm.set(norm, t);
  }
}

export function isProseInvestorLabel(raw: string): boolean {
  const n = normalizeName(raw);
  if (PROSE_BLOCKLIST.has(n)) return true;
  if (/^(leading|top|world.class|tier|our|the)\b/.test(n)) return true;
  if (/\bincluding\b/.test(n)) return true;
  if (/\bhttps?\b/.test(n)) return true;
  if (n.split(" ").length > 5) return true;
  return false;
}

/**
 * Accept investor if on known list OR looks like a proper-noun firm
 * (2–4 Title Case tokens, optional Ventures/Capital/Partners suffix).
 */
export function matchKnownInvestor(raw: string): string | null {
  const cleaned = raw
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/[()]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,;:]+$/, "");
  if (!cleaned || isProseInvestorLabel(cleaned)) return null;

  const norm = normalizeName(cleaned);
  if (knownNormalized.has(norm)) {
    return displayByNorm.get(norm) ?? cleaned;
  }

  // Known name contained in the part (e.g. "Accel Partners Inc" → Accel Partners).
  // Never expand a shorter token upward ("Microsoft" must not become "Microsoft Ventures").
  for (const [kn, display] of displayByNorm) {
    if (kn.length < 3) continue;
    if (norm === kn || norm.startsWith(`${kn} `) || norm.includes(` ${kn} `) || norm.endsWith(` ${kn}`)) {
      return display;
    }
  }

  // Non-list firms: Title Case + VC-ish suffix only (drops "Meta Superintelligence Labs").
  const tokens = cleaned.split(/\s+/);
  if (tokens.length > 4) return null;
  const hasVcSuffix =
    /\b(?:Capital|Ventures|Partners|Fund|VC|Associates)$/i.test(cleaned);
  const titleCase =
    /^(?:[A-Z][A-Za-z0-9&'.-]+)(?:\s+(?:[A-Z][A-Za-z0-9&'.-]+|&)){0,3}$/.test(
      cleaned,
    );
  if (titleCase && hasVcSuffix) {
    return cleaned;
  }

  return null;
}

/** Scan text for known investors near funding cues; return canonical names. */
export function findKnownInvestorsInText(text: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  for (const [norm, display] of displayByNorm) {
    if (norm.length < 3) continue;
    // word-ish match
    const re = new RegExp(
      `\\b${norm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")}\\b`,
      "i",
    );
    if (re.test(text)) {
      if (!seen.has(norm)) {
        seen.add(norm);
        found.push(display);
      }
    }
  }
  return found;
}

export function knownInvestorCount(): number {
  return knownNormalized.size;
}
