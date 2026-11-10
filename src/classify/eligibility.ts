import type { IndiaEligibility, RemoteScope } from "./types.js";
import { sentenceMatching, splitSentences } from "./text.js";

/** Phrases that look "global" but are about the company/customers/team — NOT applicant eligibility. */
export const ELIGIBILITY_NEGATIVE_PHRASES: RegExp[] = [
  /\bworldwide team\b/i,
  /\bglobal team\b/i,
  /\bdistributed team\b/i,
  /\bwe(?:'re| are) (?:a )?distributed\b/i,
  /\bour (?:team|company|customers?|clients?|users?|products?)\b.{0,40}\b(?:worldwide|global|around the world|100\+?\s*countries)\b/i,
  /\b(?:customers?|clients?|users?)\b.{0,40}\b(?:in|across|from)\b.{0,40}\b(?:\d+\+?\s*)?countries\b/i,
  /\bserving (?:customers?|clients?)\b.{0,40}\b(?:worldwide|globally|countries)\b/i,
  /\boffices? (?:worldwide|around the world|globally)\b/i,
  /\bglobal company\b/i,
  /\bcompany is (?:distributed|global|worldwide)\b/i,
  /\boperating in\b.{0,40}\bcountries\b/i,
  /\breach(?:ing)? (?:customers?|users?)\b.{0,40}\bcountries\b/i,
];

/** Sentence must be about who can apply / where the worker may be. */
const APPLY_CONTEXT: RegExp[] = [
  /\bcandidates?\b/i,
  /\bapplicants?\b/i,
  /\bapply\b/i,
  /\bhiring\b/i,
  /\bhire\b/i,
  /\bopen to\b/i,
  /\bwork from\b/i,
  /\bbased in\b/i,
  /\blocat(?:ion|ed)\b/i,
  /\bremote\b/i,
  /\bresidents?\b/i,
  /\bauthorized to work\b/i,
  /\beligible to work\b/i,
  /\bmust (?:be|live|reside)\b/i,
  /\bthis (?:role|position|job)\b/i,
  /\byou (?:can|will|must)\b/i,
  /\btimezone\b/i,
  /\btime zone\b/i,
];

const OPEN_LOCATION: RegExp[] = [
  /\banywhere\b/i,
  /\bworldwide\b/i,
  /\bglobal\b/i,
  /\bIndia\b/i,
  /\bAPAC\b/i,
  /\bAsia[- ]Pacific\b/i,
  /\bwork from anywhere\b/i,
];

/** Non-India geo locks in location_raw. */
const LOCKED_LOCATION: RegExp[] = [
  /\bU\.?S\.?A?\b/i,
  /\bUnited States\b/i,
  /\bEMEA\b/i,
  /\bEurope\b/i,
  /\b\bEU\b/,
  /\bUK\b/,
  /\bUnited Kingdom\b/i,
  /\bLondon\b/i,
  /\bCanada\b/i,
  /\bAustralia\b/i,
  /\bGermany\b/i,
  /\bFrance\b/i,
  /\bNetherlands\b/i,
  /\bAmsterdam\b/i,
  /\bBerlin\b/i,
  /\bNew York\b/i,
  /\bSan Francisco\b/i,
  /\bCalifornia\b/i,
  /\bAmericas\b/i,
  /\b\bAMER\b/i,
  /\b\bAPJ\b/i,
  /\bLATAM\b/i,
  /\bUKI\b/i,
  /\bJapan\b/i,
  /\bSingapore\b/i,
  /\bKorea\b/i,
  /\bBrazil\b/i,
  /\bMexico\b/i,
];

const OPEN_DESC_PATTERNS: RegExp[] = [
  /\bopen to candidates (?:from |in )?India\b/i,
  /\bcandidates (?:in|from) India\b/i,
  /\bhiring (?:in |across |from )?APAC\b/i,
  /\bhiring across APAC\b/i,
  /\banywhere in the world\b/i,
  /\bwork from anywhere\b/i,
  /\bany(?:\s+time)?\s*zone\b/i,
  /\bglobal remote\b/i,
  /\bremote worldwide\b/i,
  /\bremote[- ]friendly worldwide\b/i,
  /\bthis role is (?:remote )?worldwide\b/i,
  /\bcandidates from (?:any|all) countr(?:y|ies)\b/i,
  /\bhire(?:s|d|ing)? (?:via \w+ )?(?:in |from )?(?:100\+|over \d+)\s+countries\b/i,
  /\bIST\b/,
  /\bIndian Standard Time\b/i,
  /\bsupport any timezone\b/i,
  /\bhire globally\b/i,
];

const REGION_LOCKED_DESC_PATTERNS: RegExp[] = [
  /\bUS only\b/i,
  /\bU\.S\. only\b/i,
  /\bUSA only\b/i,
  /\bUnited States only\b/i,
  /\bmust be based in\b/i,
  /\bmust (?:live|reside|be located) in\b/i,
  /\bEU only\b/i,
  /\bEurope only\b/i,
  /\bEEA only\b/i,
  /\bauthorized to work in the (?:US|U\.S\.|United States)\b/i,
  /\beligible to work in the (?:US|U\.S\.|United States)\b/i,
  /\bUK residents?\b/i,
  /\bUnited Kingdom (?:only|residents?)\b/i,
  /\bRemote\s*\(\s*US\s*\)/i,
  /\bRemote\s*[-–—]\s*US\b/i,
  /\bRemote\s*[-–—]\s*United States\b/i,
  /\bUS[- ]based\b/i,
  /\bonly (?:open to|hiring) (?:candidates in )?(?:the )?(?:US|U\.S\.|United States|UK|EU|Canada)\b/i,
  /\bmust overlap\b/i,
  /\boverlap .{0,40}\b(?:PST|PDT|EST|EDT|CST|CDT|MST|MDT|PT|ET|Pacific|Eastern)\b/i,
  /\bwithin .{0,20}\b(?:PST|PDT|EST|EDT|CST|CDT|MST|MDT|PT|ET)\b/i,
];

const IST_EXCEPTION = /\b(?:IST|India|Indian Standard Time)\b/i;

export function isNegativeEligibilitySentence(sentence: string): boolean {
  return ELIGIBILITY_NEGATIVE_PHRASES.some((re) => re.test(sentence));
}

export function isApplyContextSentence(sentence: string): boolean {
  if (isNegativeEligibilitySentence(sentence)) return false;
  return APPLY_CONTEXT.some((re) => re.test(sentence));
}

export function classifyLocationRaw(locationRaw: string | null | undefined): {
  india_eligibility: IndiaEligibility;
  eligibility_evidence: string[];
  remote_scope: RemoteScope;
} | null {
  if (!locationRaw?.trim()) return null;
  const loc = locationRaw.trim();

  // Bare "Remote" / "Remote-friendly" alone is not decisive.
  if (/^remote(?:[- ]friendly)?$/i.test(loc)) return null;

  const hasOpen = OPEN_LOCATION.some((re) => re.test(loc));
  const hasLocked = LOCKED_LOCATION.some((re) => re.test(loc));

  // "Remote - India" / "Worldwide" → open; "Remote - USA" → locked.
  // If both (rare), lock wins when a non-India geo is explicit and India isn't.
  if (hasLocked && !/\bIndia\b|\bAPAC\b|\bAnywhere\b|\bWorldwide\b|\bGlobal\b/i.test(loc)) {
    return {
      india_eligibility: "region_locked",
      eligibility_evidence: [loc],
      remote_scope: /\bEMEA\b|\bEurope\b|\bEU\b|\bAmericas\b|\bLATAM\b/i.test(loc)
        ? "region"
        : "country",
    };
  }

  if (hasOpen) {
    return {
      india_eligibility: "open",
      eligibility_evidence: [loc],
      remote_scope: /\bIndia\b/i.test(loc)
        ? "country"
        : /\bAPAC\b/i.test(loc)
          ? "region"
          : "worldwide",
    };
  }

  return null;
}

function inferRemoteScope(
  text: string,
  eligibility: IndiaEligibility,
  evidence: string | null,
): RemoteScope {
  if (/\bhybrid\b/i.test(text)) return "hybrid";
  if (
    /\bonsite\b|\bon[- ]site\b|\bin[- ]office\b/i.test(text) &&
    !/\bremote\b/i.test(text)
  ) {
    return "onsite";
  }
  if (eligibility === "open") {
    if (
      evidence &&
      /\b(?:worldwide|anywhere|global|any(?:\s+time)?\s*zone)\b/i.test(evidence)
    ) {
      return "worldwide";
    }
    if (/\bAPAC\b/i.test(text)) return "region";
    if (/\bIndia\b/i.test(text)) return "country";
    return "worldwide";
  }
  if (eligibility === "region_locked") {
    if (/\bEU only\b|\bEurope\b|\bEMEA\b/i.test(text)) return "region";
    return "country";
  }
  if (/\bremote\b/i.test(text)) return "unknown";
  return "unknown";
}

/**
 * India eligibility: location_raw first, then description with apply-context only.
 */
export function classifyIndiaEligibility(input: {
  descriptionText: string;
  locationRaw?: string | null;
  title?: string;
}): {
  india_eligibility: IndiaEligibility;
  eligibility_evidence: string[];
  remote_scope: RemoteScope;
} {
  const fromLoc = classifyLocationRaw(input.locationRaw);
  if (fromLoc) return fromLoc;

  const text = [input.title, input.descriptionText].filter(Boolean).join("\n\n");

  for (const re of REGION_LOCKED_DESC_PATTERNS) {
    const sentence = sentenceMatching(text, re);
    if (!sentence) continue;
    if (isNegativeEligibilitySentence(sentence)) continue;

    const isTimezoneLock =
      /\b(?:PST|PDT|EST|EDT|CST|CDT|MST|MDT|PT|ET|Pacific|Eastern|overlap|within)\b/i.test(
        sentence,
      );
    if (isTimezoneLock && IST_EXCEPTION.test(sentence)) continue;

    return {
      india_eligibility: "region_locked",
      eligibility_evidence: [sentence],
      remote_scope: inferRemoteScope(text, "region_locked", sentence),
    };
  }

  for (const re of OPEN_DESC_PATTERNS) {
    // Prefer an apply-context sentence containing the match.
    let found: string | null = null;
    for (const sentence of splitSentences(text)) {
      if (!re.test(sentence)) continue;
      if (!isApplyContextSentence(sentence)) continue;
      found = sentence;
      break;
    }
    if (!found) {
      // Fall back to sentenceMatching only if that sentence passes filters.
      const sentence = sentenceMatching(text, re);
      if (sentence && isApplyContextSentence(sentence)) found = sentence;
    }
    if (!found) continue;

    return {
      india_eligibility: "open",
      eligibility_evidence: [found],
      remote_scope: inferRemoteScope(text, "open", found),
    };
  }

  return {
    india_eligibility: "unclear",
    eligibility_evidence: [],
    remote_scope: inferRemoteScope(text, "unclear", null),
  };
}
