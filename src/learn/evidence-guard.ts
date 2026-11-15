import {
  isNonLocationIndiaMention,
  isPerkAnywherePhrase,
  stripBenefitsSections,
} from "../classify/eligibility.js";
import { normalizeWhitespace } from "../classify/text.js";

const FUNDING_SECTION =
  /^(?:about\s+(?:us|the\s+company)|our\s+(?:story|investors?)|funding|backed\s+by|investors?)\b/i;

/**
 * Evidence is valid iff:
 * 1) substring of title + location + description (whitespace-normalized)
 * 2) not funding / investor / about-company fluff
 * 3) not a perk-anywhere bullet from benefits
 */
export function isEvidenceSubstring(
  evidence: string,
  title: string,
  locationRaw: string | null | undefined,
  descriptionText: string,
): boolean {
  const needle = normalizeWhitespace(evidence);
  if (!needle || needle.length < 3) return false;
  const corpus = normalizeWhitespace(
    [title, locationRaw ? `Location: ${locationRaw}` : "", descriptionText]
      .filter(Boolean)
      .join(" "),
  );
  return corpus.includes(needle);
}

export function isFundingOrInvestorEvidence(evidence: string): boolean {
  const e = evidence.trim();
  if (!e) return true;
  if (isNonLocationIndiaMention(e)) return true;
  if (FUNDING_SECTION.test(e)) return true;
  if (
    /\b(?:raised|funding|series\s*[a-d]\b|backed by|investors?|venture(?:\s+capital)?|Partners|Ventures|Peak XV|formerly)\b/i.test(
      e,
    ) &&
    /\bIndia\b/i.test(e)
  ) {
    return true;
  }
  return false;
}

/** True when evidence is about location / hire eligibility (not fluff). */
export function isEligibilityEvidence(evidence: string): boolean {
  if (!evidence.trim()) return false;
  if (isFundingOrInvestorEvidence(evidence)) return false;
  if (isPerkAnywherePhrase(evidence)) return false;
  // Must mention location/eligibility signals OR be a location_raw-style lock
  return (
    /\b(?:remote|location|based|work from|hire|hiring|candidates?|applicants?|open to|worldwide|global|anywhere|EMEA|APAC|AMER|LATAM|US|USA|United States|Europe|UK|India|Bengaluru|Bangalore|authorization|visa|sponsor|timezone|IST)\b/i.test(
      evidence,
    ) || evidence.length <= 80
  );
}

export function validateEligibilityEvidence(input: {
  evidence: string;
  title: string;
  locationRaw?: string | null;
  descriptionText: string;
}): { ok: boolean; reason?: string } {
  const { evidence, title, locationRaw, descriptionText } = input;
  if (!isEvidenceSubstring(evidence, title, locationRaw, descriptionText)) {
    return { ok: false, reason: "not_substring" };
  }
  if (isFundingOrInvestorEvidence(evidence)) {
    return { ok: false, reason: "funding_or_investor" };
  }
  if (isPerkAnywherePhrase(evidence)) {
    return { ok: false, reason: "perk_anywhere" };
  }
  if (!isEligibilityEvidence(evidence)) {
    return { ok: false, reason: "not_about_eligibility" };
  }
  return { ok: true };
}

/** Strip benefits + reject funding quotes for learned-path evidence. */
export function sanitizePostingForPatterns(descriptionText: string): string {
  return stripBenefitsSections(descriptionText);
}
