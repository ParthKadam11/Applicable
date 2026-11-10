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
  /\bcontractor\b/i,
  /\bDeel\b/i,
  /\bRemote\.com\b/i,
  /\bOyster\b/i,
  /\bEOR\b/i,
];

const TITLE_COUNTRY_CODE =
  /\(\s*(US|USA|UK|AU|NZ|SG|CA|EU|DE|NL|IE)\s*\)/i;

const REGION_LOCKED_PHRASES: RegExp[] = [
  /\bUS work authorization\b/i,
  /\bauthorized to work in the (?:US|U\.S\.|United States)\b/i,
  /\beligible to work in the (?:US|U\.S\.|United States)\b/i,
  /\bmust reside in\b/i,
  /\bmust be based in\b/i,
  /\bmust (?:live|be located) in\b/i,
  /\bUS only\b/i,
  /\bU\.S\. only\b/i,
  /\bUSA only\b/i,
  /\bUnited States only\b/i,
  /\bEU only\b/i,
  /\bEurope only\b/i,
  /\bEEA only\b/i,
  /\bUK only\b/i,
  /\bUnited Kingdom only\b/i,
  /\bPST\/EST overlap required\b/i,
  /\b(?:PST|PDT|EST|EDT)\/(?:PST|PDT|EST|EDT) overlap\b/i,
  /\bvisa sponsorship (?:is )?not available\b/i,
  /\bno visa sponsorship\b/i,
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

const OPEN_WORLDWIDE: RegExp[] = [
  /\banywhere\b/i,
  /\bworldwide\b/i,
  /\bwork from anywhere\b/i,
  /\banywhere in the world\b/i,
  /\bglobal remote\b/i,
  /\bremote worldwide\b/i,
  /\bremote[- ]friendly worldwide\b/i,
  /\bthis role is (?:remote )?worldwide\b/i,
  /\bcandidates from (?:any|all) countr(?:y|ies)\b/i,
  /\bhire globally\b/i,
  /\bsupport any timezone\b/i,
  /\bany(?:\s+time)?\s*zone\b/i,
];

const OPEN_GLOBAL_WORD = /\bglobal\b/i;

const OPEN_INDIA: RegExp[] = [
  /\bopen to candidates (?:from |in )?India\b/i,
  /\bcandidates (?:in|from) India\b/i,
  /\bIndia\b/i,
  /\bIST\b/,
  /\bIndian Standard Time\b/i,
  /\bBengaluru\b/i,
  /\bBangalore\b/i,
  /\bHyderabad\b/i,
  /\bMumbai\b/i,
  /\bPune\b/i,
  /\bDelhi\b/i,
  /\bChennai\b/i,
];

const CONTRACTOR_OPEN: RegExp[] = [
  /\bas (?:a )?contractor\b/i,
  /\bcontractor(?:s)? (?:engagement|basis|role)\b/i,
  /\bDeel\b/i,
  /\bRemote\.com\b/i,
  /\bOyster(?:HR)?\b/i,
  /\bemployer of record\b/i,
  /\b\bEOR\b/,
];

/** Remote + APAC/EMEA without India → unclear (not open). */
const REGION_REMOTE_UNCLEAR =
  /\bRemote\s*[,|-–—]?\s*(?:APAC|EMEA|Europe|Americas|LATAM|AMER)\b/i;

const REMOTE_HINT =
  /\bremote\b|\bwork from (?:home|anywhere)\b|\bwfh\b|\bdistributed\b/i;

const IST_EXCEPTION = /\b(?:IST|India|Indian Standard Time)\b/i;

const INDIA_CITY =
  /\b(?:India|Bengaluru|Bangalore|Hyderabad|Mumbai|Pune|Delhi|Noida|Gurugram|Gurgaon|Chennai|Kolkata)\b/i;

export function isNegativeEligibilitySentence(sentence: string): boolean {
  return ELIGIBILITY_NEGATIVE_PHRASES.some((re) => re.test(sentence));
}

export function isApplyContextSentence(sentence: string): boolean {
  if (isNegativeEligibilitySentence(sentence)) return false;
  return APPLY_CONTEXT.some((re) => re.test(sentence));
}

function hasBlocker(text: string): boolean {
  if (TITLE_COUNTRY_CODE.test(text)) return true;
  for (const re of REGION_LOCKED_PHRASES) {
    if (re.test(text) && !isNegativeEligibilitySentence(text)) return true;
  }
  return false;
}

function indiaSplit(
  evidence: string,
  corpus: string,
): {
  india_eligibility: "india_remote" | "india_onsite";
  remote_scope: RemoteScope;
} {
  const remote =
    REMOTE_HINT.test(evidence) ||
    REMOTE_HINT.test(corpus) ||
    /\bIST\b|Indian Standard Time/i.test(evidence);
  if (remote) {
    return { india_eligibility: "india_remote", remote_scope: "country" };
  }
  return { india_eligibility: "india_onsite", remote_scope: "onsite" };
}

export function classifyLocationRaw(locationRaw: string | null | undefined): {
  india_eligibility: IndiaEligibility;
  eligibility_evidence: string[];
  remote_scope: RemoteScope;
} | null {
  if (!locationRaw?.trim()) return null;
  const loc = locationRaw.trim();

  if (/^remote(?:[- ]friendly)?$/i.test(loc)) return null;

  // Remote, APAC / Remote, EMEA without India → unclear (not open).
  if (REGION_REMOTE_UNCLEAR.test(loc) && !INDIA_CITY.test(loc)) {
    return {
      india_eligibility: "unclear",
      eligibility_evidence: [loc],
      remote_scope: "region",
    };
  }

  // Bare APAC without India → unclear (India is in APAC, but not an explicit open).
  // Bare EMEA falls through to LOCKED_LOCATION → region_locked.
  if (/^APAC$/i.test(loc) && !INDIA_CITY.test(loc)) {
    return {
      india_eligibility: "unclear",
      eligibility_evidence: [loc],
      remote_scope: "region",
    };
  }

  if (INDIA_CITY.test(loc) && !hasBlocker(loc)) {
    const split = indiaSplit(loc, loc);
    return {
      india_eligibility: split.india_eligibility,
      eligibility_evidence: [loc],
      remote_scope: split.remote_scope,
    };
  }

  const hasLocked = LOCKED_LOCATION.some((re) => re.test(loc));
  if (
    hasLocked &&
    !/\bIndia\b|\bAnywhere\b|\bWorldwide\b|\bGlobal\b/i.test(loc)
  ) {
    return {
      india_eligibility: "region_locked",
      eligibility_evidence: [loc],
      remote_scope: /\bEMEA\b|\bEurope\b|\bEU\b|\bAmericas\b|\bLATAM\b|\bAPAC\b/i.test(
        loc,
      )
        ? "region"
        : "country",
    };
  }

  if (
    /\banywhere\b|\bworldwide\b|\bwork from anywhere\b/i.test(loc) ||
    (/\bglobal\b/i.test(loc) && !hasBlocker(loc))
  ) {
    return {
      india_eligibility: "open",
      eligibility_evidence: [loc],
      remote_scope: "worldwide",
    };
  }

  return null;
}

function inferRemoteScope(
  text: string,
  eligibility: IndiaEligibility,
  evidence: string | null,
): RemoteScope {
  if (eligibility === "india_onsite") return "onsite";
  if (eligibility === "india_remote") return "country";
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
    return "worldwide";
  }
  if (eligibility === "region_locked") {
    if (/\bEU only\b|\bEurope\b|\bEMEA\b|\bAPAC\b/i.test(text)) return "region";
    return "country";
  }
  if (/\bremote\b/i.test(text)) return "unknown";
  return "unknown";
}

/**
 * Phrase-based India eligibility on location_raw + title + description.
 * Confident open / india_* / region_locked skips LLM; unclear may call LLM.
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
  // Decisive location outcomes (including explicit unclear for Remote, APAC).
  if (fromLoc && fromLoc.india_eligibility !== "unclear") return fromLoc;
  // Keep APAC/EMEA unclear from location — do not reopen via description.
  if (fromLoc?.india_eligibility === "unclear") return fromLoc;

  const title = input.title ?? "";
  const text = [title, input.descriptionText].filter(Boolean).join("\n\n");
  const corpus = [
    title,
    input.locationRaw ? `Location: ${input.locationRaw}` : "",
    input.descriptionText,
  ]
    .filter(Boolean)
    .join("\n\n");

  const titleCode = TITLE_COUNTRY_CODE.exec(title);
  if (titleCode) {
    return {
      india_eligibility: "region_locked",
      eligibility_evidence: [title],
      remote_scope: "country",
    };
  }

  for (const re of REGION_LOCKED_PHRASES) {
    const sentence = sentenceMatching(corpus, re);
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
      remote_scope: inferRemoteScope(corpus, "region_locked", sentence),
    };
  }

  // Contractor / EOR → open (global hire path) when no geo lock.
  for (const re of CONTRACTOR_OPEN) {
    const sentence = sentenceMatching(corpus, re);
    if (!sentence) continue;
    if (isNegativeEligibilitySentence(sentence)) continue;
    return {
      india_eligibility: "open",
      eligibility_evidence: [sentence],
      remote_scope: "worldwide",
    };
  }

  // India-specific
  for (const re of OPEN_INDIA) {
    let found: string | null = null;
    for (const sentence of splitSentences(corpus)) {
      if (!re.test(sentence)) continue;
      if (isNegativeEligibilitySentence(sentence)) continue;
      // Location line or apply-context counts.
      if (
        /^Location:/i.test(sentence) ||
        isApplyContextSentence(sentence) ||
        INDIA_CITY.test(sentence)
      ) {
        found = sentence;
        break;
      }
    }
    if (!found) {
      const sentence = sentenceMatching(corpus, re);
      if (
        sentence &&
        !isNegativeEligibilitySentence(sentence) &&
        (isApplyContextSentence(sentence) || INDIA_CITY.test(sentence))
      ) {
        found = sentence;
      }
    }
    if (!found) continue;
    const split = indiaSplit(found, corpus);
    return {
      india_eligibility: split.india_eligibility,
      eligibility_evidence: [found],
      remote_scope: split.remote_scope,
    };
  }

  // Worldwide / anywhere — global only if no blocker.
  for (const re of OPEN_WORLDWIDE) {
    let found: string | null = null;
    for (const sentence of splitSentences(corpus)) {
      if (!re.test(sentence)) continue;
      if (!isApplyContextSentence(sentence)) continue;
      found = sentence;
      break;
    }
    if (!found) {
      const sentence = sentenceMatching(corpus, re);
      if (sentence && isApplyContextSentence(sentence)) found = sentence;
    }
    if (!found) continue;
    if (hasBlocker(found) || hasBlocker(corpus)) continue;
    return {
      india_eligibility: "open",
      eligibility_evidence: [found],
      remote_scope: inferRemoteScope(corpus, "open", found),
    };
  }

  // "global" alone — only with apply context and no blocker.
  for (const sentence of splitSentences(corpus)) {
    if (!OPEN_GLOBAL_WORD.test(sentence)) continue;
    if (!isApplyContextSentence(sentence)) continue;
    if (hasBlocker(sentence) || hasBlocker(corpus)) continue;
    return {
      india_eligibility: "open",
      eligibility_evidence: [sentence],
      remote_scope: "worldwide",
    };
  }

  return {
    india_eligibility: "unclear",
    eligibility_evidence: [],
    remote_scope: inferRemoteScope(corpus, "unclear", null),
  };
}
