import { stripHtml } from "../utils/html.js";
import type { IndiaEligibility, RemoteScope } from "./types.js";
import { sentenceMatching, splitSentences } from "./text.js";

/** Phrases that look "global" but are about the company/customers/team - NOT applicant eligibility. */
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
  // NOTE: bare "anywhere" is NOT context — it is the claim being validated.
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
  /\(\s*(US|USA|UK|AU|NZ|SG|CA|EU|DE|NL|IE|FR|ES|IT|CH|SE|NO|DK|FI|BE|AT|PT|PL|IN|AR|ARG|UY|BR|CO|MX|CL|PE|PL|KRK)\s*\)/i;

/** Title segments like "| Germany |", "| UK |", "- Spain -", "ARG/UY based only". */
const TITLE_GEO_PIPE =
  /(?:^|[\|\u2013\u2014\-\/:,])\s*(US|USA|UK|U\.S\.A?\.?|United States|United Kingdom|Ireland|Germany|France|Spain|Italy|Netherlands|Canada|Australia|New Zealand|Singapore|Japan|Brazil|Mexico|Argentina|Uruguay|Colombia|Chile|Peru|Poland|Sweden|Norway|Denmark|Finland|Belgium|Austria|Switzerland|Portugal|EMEA|APAC|LATAM|Europe|Americas|Africa)\s*(?:[\|\u2013\u2014\-\/:,]|$)/i;

/** Explicit based-only / country-code scopes in titles: "(ARG/UY based only)", "(BR based only)". */
const TITLE_BASED_ONLY =
  /\(\s*(?:[A-Z]{2,3}(?:\s*[\/&,]\s*[A-Z]{2,3})*)\s+based\s+only\s*\)|(?:\b(?:ARG|UY|BR|CO|MX|CL|AR)\b(?:\s*[\/&,]\s*\b(?:ARG|UY|BR|CO|MX|CL|AR)\b)*)\s+based\s+only\b/i;

const REGION_LOCKED_PHRASES: RegExp[] = [
  /\bUS work authorization\b/i,
  /\bauthorized to work in the (?:US|U\.S\.|United States)\b/i,
  /\beligible to work in the (?:US|U\.S\.|United States)\b/i,
  /\bmust reside in\b/i,
  /\bmust be based in\b/i,
  /\bbased in\b.{0,60}\b(?:Colombia|Argentina|Uruguay|Brazil|Chile|Peru|Mexico|Poland|Canada|UK|United Kingdom|United States|USA|Germany|France|Spain)\b/i,
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
  /\bEuropean Union\b/i,
  /\b\bEU\b/,
  /\bNAMER\b/i,
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
  /\bEspoo\b/i,
  /\bBelgium\b/i,
  /\bBrussels\b/i,
  /\bAustria\b/i,
  /\bVienna\b/i,
  /\bSwitzerland\b/i,
  /\bZurich\b/i,
  /\bZürich\b/i,
  /\bGeneva\b/i,
  /\bLausanne\b/i,
  /\bPortugal\b/i,
  /\bLisbon\b/i,
  /\bPoland\b/i,
  /\bWarsaw\b/i,
  /\bNew York\b/i,
  /\bNYC\b/,
  /\bSan Francisco\b/i,
  /\b\bSF\b/,
  /\bCalifornia\b/i,
  /\bSeattle\b/i,
  /\bBellevue\b/i,
  /\bAustin\b/i,
  /\bBoston\b/i,
  /\bChicago\b/i,
  /\bLos Angeles\b/i,
  /\bAlameda\b/i,
  /\bDenver\b/i,
  /\b,\s*CA\b/,
  /\b,\s*WA\b/,
  /\b,\s*NY\b/,
  /\b,\s*TX\b/,
  /\b,\s*MA\b/,
  /\b,\s*IL\b/,
  /\b,\s*CO\b/,
  /\bAmericas\b/i,
  /\bNorth America\b/i,
  /\bSouth America\b/i,
  /\b\bAMER\b/i,
  /\b\bAPJ\b/i,
  /\bAPAC\b/i,
  /\bAsia[- ]Pacific\b/i,
  /\bLATAM\b/i,
  /\bUKI\b/i,
  /\bJapan\b/i,
  /\bTokyo\b/i,
  /\bSingapore\b/i,
  /\bKorea\b/i,
  /\bBrazil\b/i,
  /\bMéxico\b/i,
  /\bMexico\b/i,
  /\bIsrael\b/i,
  /\bTel Aviv\b/i,
  /\bArgentina\b/i,
  /\bUruguay\b/i,
  /\bColombia\b/i,
  /\bChile\b/i,
  /\bPeru\b/i,
  /\bPerú\b/i,
  /\bBogot[aá]\b/i,
  /\bBuenos Aires\b/i,
  /\bMontevideo\b/i,
  /\bS[aã]o Paulo\b/i,
  /\bBelo Horizonte\b/i,
  /\bKrak[oó]w\b/i,
  /\bDenver\b/i,
  /\bKitchener\b/i,
  /\bWaterloo\b/i,
  /\bAfrica\b/i,
  /\bNigeria\b/i,
  /\bKenya\b/i,
  /\bSouth Africa\b/i,
  /\bUnited States of America\b/i,
  /\bKosovo\b/i,
  /\bHonduras\b/i,
  /\bGuatemala\b/i,
  /\bEl Salvador\b/i,
  /\bCosta Rica\b/i,
  /\bPanama\b/i,
  /\bJamaica\b/i,
  /\bDominican Republic\b/i,
  /\bPhilippines\b/i,
  /\bIndonesia\b/i,
  /\bMalaysia\b/i,
  /\bThailand\b/i,
  /\bVietnam\b/i,
  /\bTaiwan\b/i,
  /\bHong Kong\b/i,
  /\bUAE\b/i,
  /\bDubai\b/i,
  /\bSaudi Arabia\b/i,
  // Country-code scopes (word-ish / slash forms)
  /\bARG\b/,
  /\bUY\b/,
  /\bBR\b/,
  /\bCO\b(?!\s*[-.]?\s*\d)/, // avoid CO as Colorado zip noise when possible
];

/** Kept for callers / tests that still import LOCKED_LOCATION behavior via classifyLocationRaw. */
const LOCKED_LOCATION = SPECIFIC_GEO;

/**
 * Hire-location open phrases that MAY override a specific geo lock.
 * Must be about who can be hired / where candidates may be based - not perks.
 */
const STRONG_HIRE_ANYWHERE: RegExp[] = [
  /\bwe hire (?:in |from )?(?:any|all) countr/i,
  /\bhire(?:s|ing)? (?:candidates? )?(?:in |from )?(?:any|all) countr/i,
  /\bhire(?:s|d|ing)? (?:from )?(?:anywhere|globally|worldwide)\b/i,
  /\bhire globally\b/i,
  /\bcandidates? (?:can |may )?(?:be )?(?:based|located) anywhere\b/i,
  /\bcandidates? (?:can |may )?work from anywhere\b/i,
  /\bcandidates? from (?:any|all) countr(?:y|ies)\b/i,
  /\bopen to (?:all )?applicants? worldwide\b/i,
  /\bopen to (?:candidates?|applicants?) (?:from )?(?:anywhere|any country|all countries|worldwide)\b/i,
  /\bapplicants? (?:from )?(?:any|all) countr/i,
  /\byou can (?:be )?based anywhere\b/i,
  /\bthis role is (?:remote )?worldwide\b/i,
  /\b(?:open to|hiring) (?:candidates? (?:from |in )?)?(?:any|all) countr/i,
];

/**
 * Weaker "anywhere/worldwide" phrases - valid open evidence only when there is
 * NO specific geo in location/title, and never when they look like perks.
 */
const WEAK_OPEN_ANYWHERE: RegExp[] = [
  /\bwork from anywhere\b/i,
  /\bremote worldwide\b/i,
  /\bremote[- ]friendly worldwide\b/i,
  /\banywhere in the world\b/i,
  /\bglobal remote\b/i,
  /\bsupport any timezone\b/i,
  /\bany(?:\s+time)?\s*zone\b/i,
  /\bany country\b/i,
  /\ball countries\b/i,
  /\bbased anywhere\b/i,
  /\blocat(?:ion|ed)\s*[:\-]?\s*(?:anywhere|worldwide|global(?:\s+remote)?)\b/i,
  /\bremote\s*[-–—:]\s*work from anywhere\b/i,
];

/** Perk / benefits phrasing that must never count as hire-location open evidence. */
const PERK_ANYWHERE_PHRASES: RegExp[] = [
  /\bwork from anywhere\b.{0,8}\bpolicy\b/i,
  /\bwork from anywhere policy\b/i,
  /\b(?:\d+\+?\s*)?(?:weeks?|days?|months?)\s+(?:of\s+)?work from anywhere\b/i,
  /\bwork from anywhere\b.{0,60}\b(?:weeks?|days?|months?|year)\b/i,
  /\bwork from anywhere\s+(?:for|up to)\b/i,
  /\bflexible remote work\b/i,
  /\bremote work(?:ing)? flexibility\b/i,
  /\bwork from anywhere\s*!\b/i,
  /\bunlimited work from anywhere\b/i,
  /\bwork from anywhere benefit\b/i,
  /\b(?:travel|vacation|holiday|pto|paid time off|offsites?|retreats?|stipend)s?\b.{0,60}\banywhere\b/i,
  /\banywhere\b.{0,60}\b(?:travel|vacation|holiday|pto|stipend|offsites?|retreats?)\b/i,
  /\bto travel anywhere\b/i,
  /\btravel anywhere\b/i,
  /\btravel stipend\b/i,
  /\bstipend\b.{0,40}\b(?:travel|anywhere)\b/i,
];

const BENEFITS_HEADING =
  /^(?:#{1,6}\s*)?(?:benefits|perks|what we offer|why join us|our perks|the perks|benefits\s*&\s*perks|benefits and perks|life at|our benefits)\b/i;

const NON_BENEFITS_HEADING =
  /^(?:#{1,6}\s*)?(?:requirements|responsibilities|about (?:the )?(?:role|job|company)|the role|who you(?:'re| are)|qualifications|location|compensation|salary|what you(?:'ll| will) do|about you|nice to have|must have|equal opportunity)\b/i;

/** Generic words that only count with hiring-location context in the same sentence. */
const GENERIC_OPEN_WORDS: RegExp[] = [
  /\bworldwide\b/i,
  /\baround the world\b/i,
  /\bglobal\b/i,
  /\binternational\b/i,
  /\banywhere\b/i,
];

/** Drop Benefits/Perks/What we offer sections so perk bullets can't become open evidence. */
export function stripBenefitsSections(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let inBenefits = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (!inBenefits) out.push(line);
      continue;
    }
    if (BENEFITS_HEADING.test(trimmed)) {
      inBenefits = true;
      continue;
    }
    if (inBenefits && NON_BENEFITS_HEADING.test(trimmed)) {
      inBenefits = false;
    } else if (
      inBenefits &&
      !/^[-*•]/.test(trimmed) &&
      trimmed.length <= 48 &&
      /^[A-Z]/.test(trimmed) &&
      !/work from anywhere|remote|benefit|perk/i.test(trimmed) &&
      trimmed.split(/\s+/).length <= 6
    ) {
      // Likely a new short section heading
      inBenefits = false;
    }
    if (!inBenefits) out.push(line);
  }
  return out.join("\n");
}

export function isPerkAnywherePhrase(sentence: string): boolean {
  return PERK_ANYWHERE_PHRASES.some((re) => re.test(sentence));
}

/**
 * India signals that imply applicant location — never bare "India" alone
 * (investor names like "Sequoia India" / funding blurbs).
 */
const OPEN_INDIA: RegExp[] = [
  /\bopen to candidates (?:from |in )?India\b/i,
  /\bcandidates (?:in|from) India\b/i,
  /\bhire(?:s|ing)? (?:in |from )?India\b/i,
  /\b(?:remote|location|based|work from|office)\b.{0,40}\bIndia\b/i,
  /\bIndia\b.{0,40}\b(?:remote|based|location|timezone|candidates?|applicants?|hire)\b/i,
  /\bRemote\s*[-–—:/]\s*India\b/i,
  /\bIndia\s*[-–—:/]\s*Remote\b/i,
  /\bIST\b/,
  /\bIndian Standard Time\b/i,
  /\bBengaluru\b/i,
  /\bBangalore\b/i,
  /\bHyderabad\b/i,
  /\bMumbai\b/i,
  /\bPune\b/i,
  /\bDelhi\b/i,
  /\bChennai\b/i,
  /\bNoida\b/i,
  /\bGurugram\b/i,
  /\bGurgaon\b/i,
  /\bKolkata\b/i,
];

/** "India" inside investor / funding / about-company copy — not hire location. */
const INDIA_NON_LOCATION: RegExp[] = [
  /\bSequoia India\b/i,
  /\b(?:Accel|Matrix|SoftBank|Tiger|Lightspeed|Bessemer)\s+India\b/i,
  /\bPeak XV\b/i,
  /\b(?:formerly|known as)\b.{0,40}\bIndia\b/i,
  /\b(?:raised|funding|series\s*[a-d]\b|backed by|investors?|venture|led by)\b[\s\S]{0,120}\bIndia\b/i,
  /\bIndia\b[\s\S]{0,120}\b(?:raised|funding|series\s*[a-d]\b|investors?|Partners|Ventures)\b/i,
];

export function isNonLocationIndiaMention(sentence: string): boolean {
  return INDIA_NON_LOCATION.some((re) => re.test(sentence));
}

/** True when "India" / city appears with hire-location context (not funding copy). */
export function hasIndiaLocationContext(sentence: string): boolean {
  if (isNonLocationIndiaMention(sentence)) return false;
  if (
    /\b(?:Bengaluru|Bangalore|Hyderabad|Mumbai|Pune|Delhi|Noida|Gurugram|Gurgaon|Chennai|Kolkata)\b/i.test(
      sentence,
    )
  ) {
    return true;
  }
  if (/\bIST\b|\bIndian Standard Time\b/i.test(sentence)) return true;
  return (
    /\b(?:remote|location|located|based|work from|hire(?:s|d|ing)?|candidates?|applicants?|office|timezone|time zone|open to)\b[\s\S]{0,50}\bIndia\b/i.test(
      sentence,
    ) ||
    /\bIndia\b[\s\S]{0,50}\b(?:remote|based|location|located|timezone|time zone|candidates?|applicants?|hire|office)\b/i.test(
      sentence,
    )
  );
}

const CONTRACTOR_OPEN: RegExp[] = [
  /\bas (?:a )?contractor\b/i,
  /\bcontractor(?:s)? (?:engagement|basis|role)\b/i,
  /\bDeel\b/i,
  /\bRemote\.com\b/i,
  /\bOyster(?:HR)?\b/i,
  /\bemployer of record\b/i,
  /\b\bEOR\b/,
];

/** Remote + named mega-region (hyphen/comma/en-dash separators). */
const REGION_REMOTE_NAMED =
  /\bRemote\s*(?:[,|/]|[-–—])\s*(?:APAC|EMEA|Europe|Americas|LATAM|AMER|US|USA|UK)\b/i;

const REMOTE_HINT =
  /\bremote\b|\bwork from (?:home|anywhere)\b|\bwfh\b|\bdistributed\b/i;

const IST_EXCEPTION = /\b(?:IST|India|Indian Standard Time)\b/i;

const INDIA_CITY =
  /\b(?:India|Bengaluru|Bangalore|Hyderabad|Mumbai|Pune|Delhi|Noida|Gurugram|Gurgaon|Chennai|Kolkata)\b/i;

const LOCATION_OPEN =
  /\banywhere\b|\bworld[\s-]?wide\b|\bwork from anywhere\b|\bglobal(?:\s+remote)?\b/i;

/** Equipment / contractor gear — never valid as eligibility evidence. */
const CONTRACTOR_GEAR_EVIDENCE =
  /\b(?:supply a secure computer|high[‑-]speed internet|stable internet connection|company[‑-]sponsored benefits|your own (?:laptop|computer|equipment))\b/i;

/** Named mega-region → stored on remote_scope when region_locked. */
function namedRegionFromText(text: string): RemoteScope | null {
  if (/\bAPAC\b|\bAsia[- ]Pacific\b/i.test(text)) return "APAC";
  if (/^Asia$/i.test(text.trim())) return "APAC";
  if (/\bEMEA\b/i.test(text)) return "EMEA";
  if (/\bAMER\b|\bAmericas\b|\bNAMER\b/i.test(text)) return "AMER";
  if (/\bLATAM\b/i.test(text)) return "LATAM";
  if (
    /\bEurope\b|\bEuropean Union\b|\bEEA\b/i.test(text) ||
    /\bEU\b/.test(text)
  ) {
    return "Europe";
  }
  if (/\bU\.?S\.?A?\b|\bUnited States\b/i.test(text)) return "US";
  return null;
}

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
  if (TITLE_BASED_ONLY.test(title)) return title.trim();
  const code = TITLE_COUNTRY_CODE.exec(title);
  if (code) return title.trim();
  const pipe = TITLE_GEO_PIPE.exec(title);
  if (pipe) return title.trim();
  if (hasSpecificGeo(title) && !INDIA_CITY.test(title) && !LOCATION_OPEN.test(title)) {
    return title.trim();
  }
  return null;
}

export function isContractorGearEvidenceText(evidence: string): boolean {
  return CONTRACTOR_GEAR_EVIDENCE.test(evidence);
}

/** "Anywhere/worldwide" scoped to a specific non-India country is not open. */
function isCountryScopedAnywhere(sentence: string): boolean {
  return /\b(?:anywhere|worldwide|global)\b.{0,40}\b(?:in|within)\b.{0,20}\b(?:the\s+)?(?:US|U\.S\.A?\.?|USA|United States|UK|United Kingdom|EU|EEA|Europe|Canada|Australia|Germany|France|Spain|Netherlands)\b/i.test(
    sentence,
  );
}

function isAcceptableOpenEvidence(sentence: string): boolean {
  if (isNegativeEligibilitySentence(sentence)) return false;
  if (isPerkAnywherePhrase(sentence)) return false;
  if (isCountryScopedAnywhere(sentence)) return false;
  // Travel / stipend / vacation "anywhere" is never work-location open.
  if (
    /\banywhere\b/i.test(sentence) &&
    /\b(?:travel|stipend|vacation|holiday|pto|offsite|retreat|perk|benefit)\b/i.test(
      sentence,
    )
  ) {
    return false;
  }
  // "based anywhere in the USA" / similar - specific geo + anywhere is a lock.
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

function findMatchingOpenSentence(
  corpus: string,
  patterns: RegExp[],
): string | null {
  for (const re of patterns) {
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

/** Strong hire-anywhere - only these may override a specific geo lock. */
function findStrongHireAnywhereSentence(corpus: string): string | null {
  return findMatchingOpenSentence(corpus, STRONG_HIRE_ANYWHERE);
}

/** Weak anywhere/worldwide - never overrides geo; OK when location is bare Remote. */
function findWeakOpenAnywhereSentence(corpus: string): string | null {
  return findMatchingOpenSentence(corpus, WEAK_OPEN_ANYWHERE);
}

function findGenericOpenWithHiringContext(corpus: string): string | null {
  for (const sentence of splitSentences(corpus)) {
    if (isNegativeEligibilitySentence(sentence)) continue;
    if (isPerkAnywherePhrase(sentence)) continue;
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
  extras?: { title?: string; isRemoteFlag?: boolean | null },
): {
  india_eligibility: "india_remote" | "india_onsite";
  remote_scope: RemoteScope;
} {
  const title = extras?.title ?? "";
  const remote =
    extras?.isRemoteFlag === true ||
    REMOTE_HINT.test(evidence) ||
    REMOTE_HINT.test(corpus) ||
    REMOTE_HINT.test(title) ||
    /\(\s*Remote\s*\)/i.test(title) ||
    /\bIST\b|Indian Standard Time/i.test(evidence);
  if (remote) {
    return { india_eligibility: "india_remote", remote_scope: "country" };
  }
  return { india_eligibility: "india_onsite", remote_scope: "onsite" };
}

export function classifyLocationRaw(
  locationRaw: string | null | undefined,
  extras?: { title?: string; isRemoteFlag?: boolean | null },
): {
  india_eligibility: IndiaEligibility;
  eligibility_evidence: string[];
  remote_scope: RemoteScope;
} | null {
  if (!locationRaw?.trim()) return null;
  const loc = locationRaw.trim();

  if (/^remote(?:[- ]friendly)?$/i.test(loc)) return null;

  if (INDIA_CITY.test(loc) && !hasBlocker(loc)) {
    const split = indiaSplit(loc, loc, extras);
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

  // Remote - EMEA / Remote, APAC / bare EMEA|APAC|AMER|Europe|US → region_locked.
  if (
    (REGION_REMOTE_NAMED.test(loc) || LOCKED_LOCATION.some((re) => re.test(loc))) &&
    !INDIA_CITY.test(loc)
  ) {
    const named = namedRegionFromText(loc);
    return {
      india_eligibility: "region_locked",
      eligibility_evidence: [loc],
      remote_scope: named ?? "country",
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
    return namedRegionFromText(evidence ?? text) ?? "country";
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
  isRemoteFlag?: boolean | null;
}): {
  india_eligibility: IndiaEligibility;
  eligibility_evidence: string[];
  remote_scope: RemoteScope;
} {
  const title = input.title ?? "";
  const plainDescription = stripBenefitsSections(stripHtml(input.descriptionText));
  const fromLoc = classifyLocationRaw(input.locationRaw, {
    title,
    isRemoteFlag: input.isRemoteFlag,
  });
  const titleGeo = findTitleGeoEvidence(title);

  // Title/location country-code or "based only" beats India-only early return.
  if (titleGeo && !INDIA_CITY.test(titleGeo)) {
    // fall through to geoEvidence lock below
  } else if (
    fromLoc &&
    (fromLoc.india_eligibility === "india_remote" ||
      fromLoc.india_eligibility === "india_onsite" ||
      fromLoc.india_eligibility === "unclear")
  ) {
    return fromLoc;
  }
  if (fromLoc?.india_eligibility === "open" && !titleGeo) {
    return fromLoc;
  }

  const corpus = [
    title,
    input.locationRaw ? `Location: ${input.locationRaw}` : "",
    plainDescription,
  ]
    .filter(Boolean)
    .join("\n\n");

  // Location region_locked, or title geo (including when location says Anywhere/Global).
  const geoEvidence =
    fromLoc?.india_eligibility === "region_locked"
      ? (fromLoc.eligibility_evidence[0] ?? input.locationRaw!.trim())
      : titleGeo;

  // Specific country/city/region in location or title → region_locked unless
  // the body has a STRONG hire-anywhere sentence (never perk "work from anywhere").
  if (geoEvidence) {
    const strong = findStrongHireAnywhereSentence(corpus);
    if (strong && !hasBlocker(strong)) {
      const hardLock = REGION_LOCKED_PHRASES.some((re) => {
        const s = sentenceMatching(corpus, re);
        return s != null && !isNegativeEligibilitySentence(s);
      });
      if (!hardLock) {
        return {
          india_eligibility: "open",
          eligibility_evidence: [strong],
          remote_scope: "worldwide",
        };
      }
    }
    return {
      india_eligibility: "region_locked",
      eligibility_evidence: [geoEvidence],
      remote_scope:
        (fromLoc?.india_eligibility === "region_locked"
          ? fromLoc.remote_scope
          : null) ??
        namedRegionFromText(geoEvidence) ??
        inferRemoteScope(corpus, "region_locked", geoEvidence),
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

  // Contractor / EOR → open when no geo lock. Never use gear/equipment text as evidence;
  // prefer location_raw when it is worldwide/open.
  for (const re of CONTRACTOR_OPEN) {
    const sentence = sentenceMatching(corpus, re);
    if (!sentence) continue;
    if (isNegativeEligibilitySentence(sentence)) continue;
    if (CONTRACTOR_GEAR_EVIDENCE.test(sentence)) continue;
    const loc = input.locationRaw?.trim() ?? "";
    const evidence =
      loc && LOCATION_OPEN.test(loc) && !hasSpecificGeo(loc)
        ? loc
        : sentence;
    if (CONTRACTOR_GEAR_EVIDENCE.test(evidence)) continue;
    return {
      india_eligibility: "open",
      eligibility_evidence: [evidence],
      remote_scope: "worldwide",
    };
  }

  // India-specific — require location context; skip investor/funding "India".
  for (const re of OPEN_INDIA) {
    let found: string | null = null;
    for (const sentence of splitSentences(corpus)) {
      if (!re.test(sentence)) continue;
      if (isNegativeEligibilitySentence(sentence)) continue;
      if (isNonLocationIndiaMention(sentence)) continue;
      if (!hasIndiaLocationContext(sentence) && !/^Location:/i.test(sentence)) {
        continue;
      }
      found = sentence;
      break;
    }
    if (!found) {
      const sentence = sentenceMatching(corpus, re);
      if (
        sentence &&
        !isNegativeEligibilitySentence(sentence) &&
        !isNonLocationIndiaMention(sentence) &&
        (hasIndiaLocationContext(sentence) || /^Location:/i.test(sentence))
      ) {
        found = sentence;
      }
    }
    if (!found) continue;
    const split = indiaSplit(found, corpus, {
      title,
      isRemoteFlag: input.isRemoteFlag,
    });
    return {
      india_eligibility: split.india_eligibility,
      eligibility_evidence: [found],
      remote_scope: split.remote_scope,
    };
  }

  // No specific geo: strong hire-anywhere, then weak anywhere (non-perk).
  const strong = findStrongHireAnywhereSentence(corpus);
  if (strong && !hasBlocker(strong) && !hasBlocker(corpus)) {
    return {
      india_eligibility: "open",
      eligibility_evidence: [strong],
      remote_scope: inferRemoteScope(corpus, "open", strong),
    };
  }
  const weak = findWeakOpenAnywhereSentence(corpus);
  if (weak && !hasBlocker(weak) && !hasBlocker(corpus)) {
    return {
      india_eligibility: "open",
      eligibility_evidence: [weak],
      remote_scope: inferRemoteScope(corpus, "open", weak),
    };
  }

  // Generic worldwide/global/international - only with hiring-location context.
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
