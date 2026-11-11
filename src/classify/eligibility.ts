import { stripHtml } from "../utils/html.js";
import type { IndiaEligibility, RemoteScope } from "./types.js";
import { sentenceMatching, splitSentences } from "./text.js";

/** Phrases that look "global" but are about the company/customers/team — NOT applicant eligibility. */
export const ELIGIBILITY_NEGATIVE_PHRASES: RegExp[] = [
  /\bworldwide team\b/i,
  /\bglobal team\b/i,
  /\bdistributed team\b/i,
  /\bwe(?:'re| are) (?:a )?distributed\b/i,
  /\bour (?:team|company|customers?|clients?|users?|products?)\b.{0,60}\b(?:worldwide|global|around the world|100\+?\s*countries|international)\b/i,
  /\b(?:customers?|clients?|users?|organizations?|organisations?)\b.{0,60}\b(?:worldwide|around the world|globally|international|countries)\b/i,
  /\b(?:trusted|used|relied) by\b.{0,80}\b(?:worldwide|around the world|globally|countries)\b/i,
  /\bserving (?:customers?|clients?)\b.{0,40}\b(?:worldwide|globally|countries)\b/i,
  /\boffices?\b.{0,40}\b(?:worldwide|around the world|globally)\b/i,
  /\b(?:around the world|worldwide|globally)\b.{0,40}\boffices?\b/i,
  /\bglobal company\b/i,
  /\bcompany is (?:distributed|global|worldwide)\b/i,
  /\boperating in\b.{0,40}\bcountries\b/i,
  /\breach(?:ing)? (?:customers?|users?)\b.{0,40}\bcountries\b/i,
  /\bmajor organizations worldwide\b/i,
  /\b(?:products?|platform|software)\b.{0,40}\b(?:worldwide|around the world|globally)\b/i,
];

/**
 * Hiring / candidate-location context. Generic "worldwide/global" only counts
 * as open-evidence when one of these appears in the SAME sentence.
 */
const HIRING_LOCATION_CONTEXT: RegExp[] = [
  /\bremote\b/i,
  /\banywhere\b/i,
  /\blocat(?:ion|ed)\b/i,
  /\bbased\b/i,
  /\bwork from\b/i,
  /\bhire(?:s|d|ing)?\b/i,
  /\bcandidates?\b/i,
  /\bapplicants?\b/i,
  /\bapply\b/i,
  /\bopen to\b/i,
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

/** Broader apply-context (India mentions, etc.). */
const APPLY_CONTEXT: RegExp[] = [
  ...HIRING_LOCATION_CONTEXT,
  /\bopen to\b/i,
];

const TITLE_COUNTRY_CODE =
  /\(\s*(US|USA|UK|AU|NZ|SG|CA|EU|DE|NL|IE|FR|ES|IT|CH|SE|NO|DK|FI|BE|AT|PT|PL|IN)\s*\)/i;

/** Title segments like "| Germany |", "| UK |", "— Spain —". */
const TITLE_GEO_PIPE =
  /(?:^|[\|\u2013\u2014\-\/:,])\s*(US|USA|UK|U\.S\.A?\.?|United States|United Kingdom|Ireland|Germany|France|Spain|Italy|Netherlands|Canada|Australia|New Zealand|Singapore|Japan|Brazil|Mexico|Sweden|Norway|Denmark|Finland|Belgium|Austria|Switzerland|Portugal|Poland|EMEA|APAC|LATAM|Europe|Americas)\s*(?:[\|\u2013\u2014\-\/:,]|$)/i;

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
  /\b(?:based |work from )?anywhere in (?:the )?(?:US|U\.S\.A?\.?|USA|United States|UK|United Kingdom|EU|EEA|Canada|Australia)\b/i,
  /\bremote (?:role )?(?:based )?(?:in |within )?(?:the )?(?:US|U\.S\.A?\.?|USA|United States) only\b/i,
];

/** Non-India countries / cities / regions that pin the role to a place. */
const SPECIFIC_GEO: RegExp[] = [
  /\bU\.?S\.?A?\b/i,
  /\bUnited States\b/i,
  /\bEMEA\b/i,
  /\bEurope\b/i,
  /\b\bEU\b/,
  /\bUK\b/,
  /\bUnited Kingdom\b/i,
  /\bEngland\b/i,
  /\bScotland\b/i,
  /\bWales\b/i,
  /\bIreland\b/i,
  /\bRepublic of Ireland\b/i,
  /\bLondon\b/i,
  /\bDublin\b/i,
  /\bEdinburgh\b/i,
  /\bManchester\b/i,
  /\bCanada\b/i,
  /\bToronto\b/i,
  /\bVancouver\b/i,
  /\bMontreal\b/i,
  /\bAustralia\b/i,
  /\bSydney\b/i,
  /\bMelbourne\b/i,
  /\bGermany\b/i,
  /\bBerlin\b/i,
  /\bMunich\b/i,
  /\bMünchen\b/i,
  /\bHamburg\b/i,
  /\bFrankfurt\b/i,
  /\bFrance\b/i,
  /\bParis\b/i,
  /\bLyon\b/i,
  /\bNetherlands\b/i,
  /\bAmsterdam\b/i,
  /\bRotterdam\b/i,
  /\bSpain\b/i,
  /\bMadrid\b/i,
  /\bBarcelona\b/i,
  /\bItaly\b/i,
  /\bMilan\b/i,
  /\bRome\b/i,
  /\bSweden\b/i,
  /\bStockholm\b/i,
  /\bNorway\b/i,
  /\bOslo\b/i,
  /\bDenmark\b/i,
  /\bCopenhagen\b/i,
  /\bFinland\b/i,
  /\bHelsinki\b/i,
  /\bBelgium\b/i,
  /\bBrussels\b/i,
  /\bAustria\b/i,
  /\bVienna\b/i,
  /\bSwitzerland\b/i,
  /\bZurich\b/i,
  /\bZürich\b/i,
  /\bGeneva\b/i,
  /\bPortugal\b/i,
  /\bLisbon\b/i,
  /\bPoland\b/i,
  /\bWarsaw\b/i,
  /\bNew York\b/i,
  /\bSan Francisco\b/i,
  /\bCalifornia\b/i,
  /\bSeattle\b/i,
  /\bAustin\b/i,
  /\bBoston\b/i,
  /\bChicago\b/i,
  /\bLos Angeles\b/i,
  /\bAlameda\b/i,
  /\b,\s*CA\b/,
  /\bAmericas\b/i,
  /\bNorth America\b/i,
  /\bSouth America\b/i,
  /\b\bAMER\b/i,
  /\b\bAPJ\b/i,
  /\bLATAM\b/i,
  /\bUKI\b/i,
  /\bJapan\b/i,
  /\bTokyo\b/i,
  /\bSingapore\b/i,
  /\bKorea\b/i,
  /\bBrazil\b/i,
  /\bMexico\b/i,
  /\bIsrael\b/i,
  /\bTel Aviv\b/i,
];

/** Kept for callers / tests that still import LOCKED_LOCATION behavior via classifyLocationRaw. */
const LOCKED_LOCATION = SPECIFIC_GEO;

/**
 * Strong location-scope open phrases — about WHERE the candidate can work.
 * Prefer these as open evidence over generic "worldwide".
 */
const EXPLICIT_OPEN_HIRE: RegExp[] = [
  /\bwork from anywhere\b/i,
  /\bremote worldwide\b/i,
  /\bremote[- ]friendly worldwide\b/i,
  /\banywhere in the world\b/i,
  /\bglobal remote\b/i,
  /\bthis role is (?:remote )?worldwide\b/i,
  /\b(?:open to|hiring) (?:candidates? (?:from |in )?)?(?:any|all) countr/i,
  /\bcandidates? from (?:any|all) countr(?:y|ies)\b/i,
  /\bhire(?:s|d|ing)? (?:from )?(?:anywhere|globally|worldwide)\b/i,
  /\bhire globally\b/i,
  /\bsupport any timezone\b/i,
  /\bany(?:\s+time)?\s*zone\b/i,
  /\bany country\b/i,
  /\ball countries\b/i,
  /\bbased anywhere\b/i,
  /\blocat(?:ion|ed)\s*[:\-]?\s*(?:anywhere|worldwide|global(?:\s+remote)?)\b/i,
  /\bremote\s*[-–—:]\s*work from anywhere\b/i,
];

/** Generic words that only count with hiring-location context in the same sentence. */
const GENERIC_OPEN_WORDS: RegExp[] = [
  /\bworldwide\b/i,
  /\baround the world\b/i,
  /\bglobal\b/i,
  /\binternational\b/i,
  /\banywhere\b/i,
];

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

const LOCATION_OPEN =
  /\banywhere\b|\bworldwide\b|\bwork from anywhere\b|\bglobal(?:\s+remote)?\b/i;

export function isNegativeEligibilitySentence(sentence: string): boolean {
  return ELIGIBILITY_NEGATIVE_PHRASES.some((re) => re.test(sentence));
}

export function isHiringLocationContext(sentence: string): boolean {
  if (isNegativeEligibilitySentence(sentence)) return false;
  return HIRING_LOCATION_CONTEXT.some((re) => re.test(sentence));
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

function hasSpecificGeo(text: string): boolean {
  return SPECIFIC_GEO.some((re) => re.test(text));
}

function findTitleGeoEvidence(title: string): string | null {
  if (!title.trim()) return null;
  const code = TITLE_COUNTRY_CODE.exec(title);
  if (code) return title.trim();
  const pipe = TITLE_GEO_PIPE.exec(title);
  if (pipe) return title.trim();
  if (hasSpecificGeo(title) && !INDIA_CITY.test(title) && !LOCATION_OPEN.test(title)) {
    return title.trim();
  }
  return null;
}

/** "Anywhere/worldwide" scoped to a specific non-India country is not open. */
function isCountryScopedAnywhere(sentence: string): boolean {
  return /\b(?:anywhere|worldwide|global)\b.{0,40}\b(?:in|within)\b.{0,20}\b(?:the\s+)?(?:US|U\.S\.A?\.?|USA|United States|UK|United Kingdom|EU|EEA|Europe|Canada|Australia|Germany|France|Spain|Netherlands)\b/i.test(
    sentence,
  );
}

function isAcceptableOpenEvidence(sentence: string): boolean {
  if (isNegativeEligibilitySentence(sentence)) return false;
  if (isCountryScopedAnywhere(sentence)) return false;
  // "based anywhere in the USA" / similar — specific geo + anywhere is a lock.
  if (
    hasSpecificGeo(sentence) &&
    /\b(?:anywhere|worldwide)\b/i.test(sentence) &&
    !/\b(?:anywhere|worldwide)\b.{0,40}\b(?:world|globe|planet|country|countries|timezone)\b/i.test(
      sentence,
    )
  ) {
    return false;
  }
  return true;
}

function findExplicitOpenSentence(corpus: string): string | null {
  for (const re of EXPLICIT_OPEN_HIRE) {
    for (const sentence of splitSentences(corpus)) {
      if (!re.test(sentence)) continue;
      if (!isAcceptableOpenEvidence(sentence)) continue;
      return sentence;
    }
    const sentence = sentenceMatching(corpus, re);
    if (sentence && isAcceptableOpenEvidence(sentence)) return sentence;
  }
  return null;
}

function findGenericOpenWithHiringContext(corpus: string): string | null {
  for (const sentence of splitSentences(corpus)) {
    if (isNegativeEligibilitySentence(sentence)) continue;
    const hasGeneric = GENERIC_OPEN_WORDS.some((re) => re.test(sentence));
    if (!hasGeneric) continue;
    if (!isHiringLocationContext(sentence) && !/^Location:/i.test(sentence)) {
      continue;
    }
    // Prefer sentences that look like location-scope, not marketing.
    if (
      /\b(?:customers?|clients?|users?|organizations?|organisations?|offices?|products?|platform)\b/i.test(
        sentence,
      ) &&
      !/\b(?:candidates?|applicants?|work from|hire|remote worldwide|global remote)\b/i.test(
        sentence,
      )
    ) {
      continue;
    }
    return sentence;
  }
  return null;
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

  // Location itself is explicitly worldwide / global remote / anywhere.
  if (LOCATION_OPEN.test(loc) && !hasSpecificGeo(loc)) {
    return {
      india_eligibility: "open",
      eligibility_evidence: [loc],
      remote_scope: "worldwide",
    };
  }

  // Specific country/city/region in location → region_locked (caller may
  // upgrade to open only with an explicit hiring open phrase in the body).
  if (LOCKED_LOCATION.some((re) => re.test(loc)) && !INDIA_CITY.test(loc)) {
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

  // "Remote - work from anywhere" style locations without a named country.
  if (LOCATION_OPEN.test(loc)) {
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
 *
 * Priority: location/title specific geo blocks "open" unless the body has an
 * explicit hiring location-scope phrase (work from anywhere, remote worldwide, …).
 * Generic "worldwide/global" marketing never counts as open evidence.
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
  const title = input.title ?? "";
  const plainDescription = stripHtml(input.descriptionText);
  const fromLoc = classifyLocationRaw(input.locationRaw);

  // India / APAC-unclear / explicit open from location alone — decisive.
  if (
    fromLoc &&
    (fromLoc.india_eligibility === "india_remote" ||
      fromLoc.india_eligibility === "india_onsite" ||
      fromLoc.india_eligibility === "unclear" ||
      fromLoc.india_eligibility === "open")
  ) {
    return fromLoc;
  }

  const corpus = [
    title,
    input.locationRaw ? `Location: ${input.locationRaw}` : "",
    plainDescription,
  ]
    .filter(Boolean)
    .join("\n\n");

  const titleGeo = findTitleGeoEvidence(title);
  const specificGeoEvidence =
    fromLoc?.india_eligibility === "region_locked"
      ? (fromLoc.eligibility_evidence[0] ?? input.locationRaw!.trim())
      : titleGeo;

  // Specific country/city/region in location or title → not open unless
  // the body explicitly says candidates can work from anywhere / worldwide.
  if (specificGeoEvidence) {
    const explicit = findExplicitOpenSentence(corpus);
    if (explicit && !hasBlocker(explicit)) {
      // Only allow override when the open phrase is not contradicted by a
      // hard authorization lock in the same corpus.
      const hardLock = REGION_LOCKED_PHRASES.some((re) => {
        const s = sentenceMatching(corpus, re);
        return s != null && !isNegativeEligibilitySentence(s);
      });
      if (!hardLock) {
        return {
          india_eligibility: "open",
          eligibility_evidence: [explicit],
          remote_scope: "worldwide",
        };
      }
    }
    return {
      india_eligibility: "region_locked",
      eligibility_evidence: [specificGeoEvidence],
      remote_scope: inferRemoteScope(corpus, "region_locked", specificGeoEvidence),
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

  // Explicit location-scope open phrases first (preferred evidence).
  const explicit = findExplicitOpenSentence(corpus);
  if (explicit && !hasBlocker(explicit) && !hasBlocker(corpus)) {
    return {
      india_eligibility: "open",
      eligibility_evidence: [explicit],
      remote_scope: inferRemoteScope(corpus, "open", explicit),
    };
  }

  // Generic worldwide/global/international — only with hiring-location context.
  const generic = findGenericOpenWithHiringContext(corpus);
  if (
    generic &&
    isAcceptableOpenEvidence(generic) &&
    !hasBlocker(generic) &&
    !hasBlocker(corpus)
  ) {
    return {
      india_eligibility: "open",
      eligibility_evidence: [generic],
      remote_scope: inferRemoteScope(corpus, "open", generic),
    };
  }

  return {
    india_eligibility: "unclear",
    eligibility_evidence: [],
    remote_scope: inferRemoteScope(corpus, "unclear", null),
  };
}
