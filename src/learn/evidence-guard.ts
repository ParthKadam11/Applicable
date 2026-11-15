import {
  isNonLocationIndiaMention,
  isPerkAnywherePhrase,
  stripBenefitsSections,
} from "../classify/eligibility.js";
import { normalizeWhitespace, splitSentences } from "../classify/text.js";

export type EvidenceFailCause =
  | "empty"
  | "not_substring"
  | "funding_investor"
  | "about_hq"
  | "benefits_perk"
  | "office_list"
  | "contractor_gear"
  | "not_about_eligibility"
  | "ok";

const FUNDING_SECTION =
  /^(?:about\s+(?:us|the\s+company)|our\s+(?:story|investors?|mission)|funding|backed\s+by|investors?)\b/i;

const ABOUT_HQ =
  /\b(?:about\s+(?:us|the\s+company)|our\s+(?:story|mission|investors?|team)|headquarters|headquartered|\bHQ\b|founded in|backed by|series\s*[a-d]\b)\b/i;

const OFFICE_LIST =
  /\b(?:our offices?(?:\s+in)?|offices?\s+in|office locations?|we have offices)\b/i;

const CONTRACTOR_GEAR =
  /\b(?:supply a secure computer|high[‑-]speed internet|company[‑-]sponsored benefits|your own (?:laptop|computer|equipment))\b/i;

const LOCATION_SIGNAL =
  /\b(?:remote|location|based|work from|hire|hiring|candidates?|applicants?|open to|worldwide|world[\s-]?wide|global|anywhere|EMEA|APAC|AMER|LATAM|US|USA|United States|Europe|UK|India|Bengaluru|Bangalore|Hyderabad|authorization|visa|sponsor|timezone|IST|Argentina|Brazil|Mexico|Canada|Australia|San Francisco|New York|Seattle|Austin|Boston|Chicago|London|Berlin|Toronto|Sunnyvale|Bellevue|NYC|California|WA|CA|NY)\b/i;

/**
 * Evidence is valid iff:
 * 1) substring of title + location + description (whitespace-normalized)
 * 2) not funding / investor / about-company / HQ fluff
 * 3) not a perk-anywhere or contractor-gear benefits bullet
 * 4) actually about location/eligibility
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
  // Explicit investor/funding mentions → company enrichment facts, never location evidence
  if (
    /\b(?:backed by|funded by|investors?(?:\s+include)?|venture(?:\s+capital)?|Series\s+[A-F]\b|Peak\s+XV|formerly\s+Sequoia(?:\s+India)?|Sequoia\s+India)\b/i.test(
      e,
    )
  ) {
    return true;
  }
  if (
    /\b(?:raised|funding|series\s*[a-d]\b|investors?|Partners|Ventures)\b/i.test(
      e,
    ) &&
    /\bIndia\b/i.test(e)
  ) {
    return true;
  }
  return false;
}

export function isAboutOrHqEvidence(evidence: string): boolean {
  return ABOUT_HQ.test(evidence);
}

export function isOfficeListEvidence(evidence: string): boolean {
  return OFFICE_LIST.test(evidence);
}

export function isContractorGearEvidence(evidence: string): boolean {
  return CONTRACTOR_GEAR.test(evidence);
}

/** True when evidence is about location / hire eligibility (not fluff). */
export function isEligibilityEvidence(evidence: string): boolean {
  if (!evidence.trim()) return false;
  if (isFundingOrInvestorEvidence(evidence)) return false;
  if (isAboutOrHqEvidence(evidence)) return false;
  if (isOfficeListEvidence(evidence)) return false;
  if (isPerkAnywherePhrase(evidence)) return false;
  if (isContractorGearEvidence(evidence)) return false;
  return LOCATION_SIGNAL.test(evidence);
}

export function classifyEvidenceFailure(
  evidence: string,
  title: string,
  locationRaw: string | null | undefined,
  descriptionText: string,
): EvidenceFailCause {
  if (!evidence?.trim()) return "empty";
  if (!isEvidenceSubstring(evidence, title, locationRaw, descriptionText)) {
    return "not_substring";
  }
  if (isFundingOrInvestorEvidence(evidence)) return "funding_investor";
  if (isAboutOrHqEvidence(evidence)) return "about_hq";
  if (isOfficeListEvidence(evidence)) return "office_list";
  if (isPerkAnywherePhrase(evidence)) return "benefits_perk";
  if (isContractorGearEvidence(evidence)) return "contractor_gear";
  if (!isEligibilityEvidence(evidence)) return "not_about_eligibility";
  return "ok";
}

export function validateEligibilityEvidence(input: {
  evidence: string;
  title: string;
  locationRaw?: string | null;
  descriptionText: string;
}): { ok: boolean; reason?: EvidenceFailCause } {
  const cause = classifyEvidenceFailure(
    input.evidence,
    input.title,
    input.locationRaw,
    input.descriptionText,
  );
  if (cause === "ok") return { ok: true };
  return { ok: false, reason: cause };
}

/**
 * Prefer location_raw, then eligibility sentences in posting (benefits stripped),
 * never funding/about/HQ/contractor-gear.
 */
export function selectBestEligibilityEvidence(input: {
  title: string;
  locationRaw?: string | null;
  descriptionText: string;
  candidates?: string[];
}): { evidence: string | null; source: "location_raw" | "candidate" | "sentence" | "none" } {
  const { title, locationRaw, descriptionText, candidates = [] } = input;
  const loc = locationRaw?.trim() ?? "";
  if (loc.length >= 2) {
    const v = validateEligibilityEvidence({
      evidence: loc,
      title,
      locationRaw,
      descriptionText: descriptionText || loc,
    });
    // location_raw is always a substring of the Location: corpus we build
    if (
      v.ok ||
      (LOCATION_SIGNAL.test(loc) &&
        !isFundingOrInvestorEvidence(loc) &&
        !isContractorGearEvidence(loc))
    ) {
      return { evidence: loc, source: "location_raw" };
    }
  }

  for (const c of candidates) {
    const v = validateEligibilityEvidence({
      evidence: c,
      title,
      locationRaw,
      descriptionText,
    });
    if (v.ok) return { evidence: c.trim(), source: "candidate" };
  }

  const plain = stripBenefitsSections(descriptionText);
  for (const sentence of splitSentences(plain)) {
    if (!LOCATION_SIGNAL.test(sentence)) continue;
    const v = validateEligibilityEvidence({
      evidence: sentence,
      title,
      locationRaw,
      descriptionText,
    });
    if (v.ok) return { evidence: sentence.trim(), source: "sentence" };
  }

  // Last resort: location_raw even if weak signal (still better than benefits fluff)
  if (loc.length >= 2) return { evidence: loc, source: "location_raw" };
  return { evidence: null, source: "none" };
}

/** Strip benefits + reject funding quotes for learned-path evidence. */
export function sanitizePostingForPatterns(descriptionText: string): string {
  return stripBenefitsSections(descriptionText);
}

/**
 * True when evidence explicitly names a country or region restriction
 * (not just a US city like "New York, NY" alone).
 */
export function evidenceNamesCountryOrRegionRestriction(
  evidence: string,
): boolean {
  const e = normalizeWhitespace(evidence);
  if (!e) return false;
  // Explicit country / multi-country / region codes
  if (
    /\b(?:India|Argentina|Brazil|Mexico|Chile|Colombia|Uruguay|Canada|Australia|Germany|France|Spain|Netherlands|Singapore|Japan|China|UK|U\.?K\.?|United Kingdom|EU|Europe|EMEA|APAC|LATAM|AMER|United States|USA|\bUS\b)\b/i.test(
      e,
    )
  ) {
    // City-only US locations without country/auth language are noisy
    // (e.g. "Location: New York, NY" → india_onsite). Require restriction language
    // OR a non-US country/region, OR explicit US/United States/authorization.
    if (
      /\b(?:only|must be|based in|located in|work authorization|visa|citizens?|residents?|eligible|restricted|not (?:open|available)|EMEA|APAC|LATAM|AMER)\b/i.test(
        e,
      )
    ) {
      return true;
    }
    if (
      /\b(?:India|Argentina|Brazil|Mexico|Chile|Colombia|Uruguay|Canada|Australia|Germany|France|Spain|Netherlands|Singapore|Japan|China|UK|U\.?K\.?|United Kingdom|EU|Europe|United States|USA)\b/i.test(
        e,
      )
    ) {
      return true;
    }
    // Bare "US" / state+city without restriction language → reject
    return false;
  }
  return false;
}

/** Min LLM self-confidence to accept an llm_crosscheck correction. */
export const LLM_CROSSCHECK_MIN_CONFIDENCE = 0.8;

/**
 * Gate llm_crosscheck writes: guard OK + confidence ≥ 0.8 + country/region named.
 * Also rejects label/evidence mismatches (e.g. US city → india_onsite).
 */
export function acceptLlmCrosscheckCorrection(input: {
  evidence: string;
  title: string;
  locationRaw?: string | null;
  descriptionText: string;
  confidence: number | null | undefined;
  newLabel?: string;
}): { ok: true } | { ok: false; reason: string } {
  const guard = validateEligibilityEvidence(input);
  if (!guard.ok) {
    return { ok: false, reason: `evidence_guard:${guard.reason}` };
  }
  const conf = input.confidence;
  if (conf == null || Number.isNaN(conf) || conf < LLM_CROSSCHECK_MIN_CONFIDENCE) {
    return {
      ok: false,
      reason: `confidence:${conf ?? "missing"}<${LLM_CROSSCHECK_MIN_CONFIDENCE}`,
    };
  }
  if (!evidenceNamesCountryOrRegionRestriction(input.evidence)) {
    return { ok: false, reason: "no_country_region_restriction" };
  }
  const label = input.newLabel ?? "";
  if (
    (label === "india_remote" || label === "india_onsite") &&
    !/\bIndia\b/i.test(input.evidence)
  ) {
    return { ok: false, reason: "india_label_without_india_evidence" };
  }
  return { ok: true };
}
