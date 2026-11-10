import type {
  ClassificationResult,
  IndiaEligibility,
  InterviewStyle,
  RemoteScope,
  RoleFamily,
  Seniority,
} from "./types.js";
import { sentenceMatching } from "./text.js";

/** Open-to-India / worldwide signals. Bare "Remote" alone is NOT open. */
const OPEN_PATTERNS: RegExp[] = [
  /\bIndia\b/i,
  /\bAPAC\b/i,
  /\bAsia[- ]Pacific\b/i,
  /\banywhere in the world\b/i,
  /\bworldwide\b/i,
  /\bwork from anywhere\b/i,
  /\bany(?:\s+time)?\s*zone\b/i,
  /\bglobal remote\b/i,
  /\b(?:100\+|over \d+)\s+countries\b/i,
  /\bremote[- ]friendly worldwide\b/i,
  /\bcandidates from (?:any|all) countr(?:y|ies)\b/i,
  /\bopen to candidates (?:from |in )?India\b/i,
  /\bIST\b/,
  /\bIndian Standard Time\b/i,
];

/** Explicit geographic / authorization locks. */
const REGION_LOCKED_PATTERNS: RegExp[] = [
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
  /\b(?:PST|PDT|EST|EDT|Pacific Time|Eastern Time).{0,40}\boverlap\b/i,
];

const IST_EXCEPTION = /\b(?:IST|India|Indian Standard Time)\b/i;

const CONTRACTOR_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\bDeel\b/i, label: "Deel" },
  { re: /\bRemote\.com\b/i, label: "Remote.com" },
  { re: /\bOyster(?:HR)?\b/i, label: "Oyster" },
  { re: /\bRippling\b.{0,20}\bEOR\b/i, label: "Rippling EOR" },
  { re: /\bEOR\b.{0,20}\bRippling\b/i, label: "Rippling EOR" },
  { re: /\bas (?:a )?contractor\b/i, label: "contractor" },
  { re: /\bcontractor(?:s)? (?:engagement|basis|role)\b/i, label: "contractor" },
  { re: /\bemployer of record\b/i, label: "employer of record" },
];

const INTERVIEW_PATTERNS: Array<{ style: InterviewStyle; re: RegExp }> = [
  { style: "take_home", re: /\btake[- ]home\b/i },
  { style: "take_home", re: /\bhome assignment\b/i },
  { style: "take_home", re: /\bcoding (?:exercise|challenge|assignment)\b/i },
  { style: "live_coding", re: /\blive[- ]coding\b/i },
  { style: "live_coding", re: /\bcoding interview\b/i },
  { style: "dsa", re: /\bdata structures?\b/i },
  { style: "dsa", re: /\balgorithms?\b/i },
  { style: "dsa", re: /\b\bDSA\b/ },
  { style: "dsa", re: /\bleetcode[- ]style\b/i },
  { style: "system_design", re: /\bsystem design\b/i },
  { style: "pair_programming", re: /\bpair[- ]programm(?:ing|ed)\b/i },
];

const SENIORITY_PATTERNS: Array<{ level: Seniority; re: RegExp }> = [
  { level: "intern", re: /\bintern(?:ship)?\b/i },
  { level: "staff", re: /\bstaff\b/i },
  { level: "staff", re: /\bprincipal\b/i },
  { level: "senior", re: /\bsenior\b/i },
  { level: "senior", re: /\bSr\.?\b/ },
  { level: "junior", re: /\bjunior\b/i },
  { level: "junior", re: /\bentry[- ]level\b/i },
  { level: "mid", re: /\bmid[- ]level\b/i },
  { level: "mid", re: /\bmid[- ]career\b/i },
];

const ROLE_PATTERNS: Array<{ family: RoleFamily; re: RegExp }> = [
  { family: "ml", re: /\bmachine learning\b/i },
  { family: "ml", re: /\b\bML\b(?:\s+engineer)?/ },
  { family: "ml", re: /\bdata scientist\b/i },
  { family: "ml", re: /\bLLM\b/ },
  { family: "infra", re: /\bdevops\b/i },
  { family: "infra", re: /\bsite reliability\b/i },
  { family: "infra", re: /\b\bSRE\b/ },
  { family: "infra", re: /\binfrastructure\b/i },
  { family: "infra", re: /\bplatform engineer\b/i },
  { family: "fullstack", re: /\bfull[- ]?stack\b/i },
  { family: "frontend", re: /\bfront[- ]?end\b/i },
  { family: "frontend", re: /\breact\b/i },
  { family: "backend", re: /\bback[- ]?end\b/i },
  { family: "backend", re: /\bapi engineer\b/i },
  { family: "backend", re: /\bserver[- ]side\b/i },
];

function classifyIndiaEligibility(text: string): {
  india_eligibility: IndiaEligibility;
  eligibility_evidence: string[];
  remote_scope: RemoteScope;
} {
  // Region locks take priority when explicit (unless IST/India exception softens timezone rules).
  for (const re of REGION_LOCKED_PATTERNS) {
    const sentence = sentenceMatching(text, re);
    if (!sentence) continue;

    // Timezone-overlap locks are region_locked unless IST/India is also mentioned.
    const isTimezoneLock =
      /\b(?:PST|PDT|EST|EDT|CST|CDT|MST|MDT|PT|ET|Pacific|Eastern|overlap|within)\b/i.test(
        sentence,
      );
    if (isTimezoneLock && IST_EXCEPTION.test(sentence)) {
      continue;
    }

    return {
      india_eligibility: "region_locked",
      eligibility_evidence: [sentence],
      remote_scope: inferRemoteScope(text, "region_locked", sentence),
    };
  }

  for (const re of OPEN_PATTERNS) {
    const sentence = sentenceMatching(text, re);
    if (!sentence) continue;
    return {
      india_eligibility: "open",
      eligibility_evidence: [sentence],
      remote_scope: inferRemoteScope(text, "open", sentence),
    };
  }

  return {
    india_eligibility: "unclear",
    eligibility_evidence: [],
    remote_scope: inferRemoteScope(text, "unclear", null),
  };
}

function inferRemoteScope(
  text: string,
  eligibility: IndiaEligibility,
  evidence: string | null,
): RemoteScope {
  if (/\bhybrid\b/i.test(text)) {
    return "hybrid";
  }
  if (/\bonsite\b|\bon[- ]site\b|\bin[- ]office\b/i.test(text) && !/\bremote\b/i.test(text)) {
    return "onsite";
  }
  if (eligibility === "open") {
    if (
      evidence &&
      /\b(?:worldwide|anywhere in the world|work from anywhere|global remote|any(?:\s+time)?\s*zone)\b/i.test(
        evidence,
      )
    ) {
      return "worldwide";
    }
    if (/\bAPAC\b|\bEurope\b|\bEMEA\b|\bAmericas\b/i.test(text)) return "region";
    if (/\bIndia\b/i.test(text)) return "country";
    return "worldwide";
  }
  if (eligibility === "region_locked") {
    if (/\bRemote\s*\(\s*US\s*\)|\bUS only\b|\bUK residents?\b/i.test(text)) {
      return "country";
    }
    if (/\bEU only\b|\bEurope only\b/i.test(text)) return "region";
    return "region";
  }
  if (/\bremote\b/i.test(text)) return "unknown";
  return "unknown";
}

function classifyInterview(text: string): {
  interview_style: InterviewStyle[];
  interview_style_evidence: Record<string, string[]>;
} {
  const evidence: Record<string, string[]> = {};
  for (const { style, re } of INTERVIEW_PATTERNS) {
    const sentence = sentenceMatching(text, re);
    if (!sentence) continue;
    const list = evidence[style] ?? [];
    if (!list.includes(sentence)) list.push(sentence);
    evidence[style] = list;
  }
  const styles = Object.keys(evidence) as InterviewStyle[];
  if (styles.length === 0) {
    return {
      interview_style: ["unknown"],
      interview_style_evidence: {},
    };
  }
  return { interview_style: styles, interview_style_evidence: evidence };
}

function classifyContractor(text: string): {
  contractor_or_eor: boolean | null;
  contractor_or_eor_evidence: string | null;
} {
  for (const { re } of CONTRACTOR_PATTERNS) {
    const sentence = sentenceMatching(text, re);
    if (sentence) {
      return { contractor_or_eor: true, contractor_or_eor_evidence: sentence };
    }
  }
  return { contractor_or_eor: false, contractor_or_eor_evidence: null };
}

function classifySeniority(title: string, text: string): {
  seniority: Seniority;
  evidence: string | null;
} {
  const combined = `${title}\n${text}`;
  for (const { level, re } of SENIORITY_PATTERNS) {
    const sentence = sentenceMatching(combined, re);
    if (sentence) return { seniority: level, evidence: sentence };
  }
  return { seniority: "unknown", evidence: null };
}

function classifyRoleFamily(title: string, text: string): {
  role_family: RoleFamily;
  evidence: string | null;
} {
  const combined = `${title}\n${text}`;
  for (const { family, re } of ROLE_PATTERNS) {
    const sentence = sentenceMatching(combined, re);
    if (sentence) return { role_family: family, evidence: sentence };
  }
  return { role_family: "other", evidence: null };
}

export function parseCompensation(text: string): ClassificationResult["compensation"] {
  // $120,000–$150,000 / $120k-$150k / €80 000 - €100 000 / £70k per year
  const rangeRe =
    /(?:(?<cur1>USD|EUR|GBP|INR|\$|€|£)\s*)?(?<min>\d{2,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)\s*(?<suf1>[kKmM])?\s*(?:[-–—]|to)\s*(?:(?<cur2>USD|EUR|GBP|INR|\$|€|£)\s*)?(?<max>\d{2,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)\s*(?<suf2>[kKmM])?/i;

  const singleRe =
    /(?:(?<cur>USD|EUR|GBP|INR|\$|€|£)\s*)(?<amount>\d{2,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)\s*(?<suf>[kKmM])?/i;

  const period = /\bper\s+hour\b|\bhourly\b|\b\/\s*hr\b/i.test(text)
    ? ("hour" as const)
    : /\bper\s+month\b|\bmonthly\b|\b\/\s*mo\b/i.test(text)
      ? ("month" as const)
      : /\bper\s+year\b|\bannually\b|\b\/\s*yr\b|\bsalary\b/i.test(text)
        ? ("year" as const)
        : ("year" as const);

  const mapCurrency = (raw: string | undefined): string | null => {
    if (!raw) return null;
    const u = raw.toUpperCase();
    if (u === "$" || u === "USD") return "USD";
    if (u === "€" || u === "EUR") return "EUR";
    if (u === "£" || u === "GBP") return "GBP";
    if (u === "INR") return "INR";
    return u;
  };

  const scale = (n: number, suf?: string): number => {
    if (!suf) return Math.round(n);
    const s = suf.toLowerCase();
    if (s === "k") return Math.round(n * 1_000);
    if (s === "m") return Math.round(n * 1_000_000);
    return Math.round(n);
  };

  const range = rangeRe.exec(text);
  if (range?.groups) {
    const min = scale(
      Number(range.groups.min!.replace(/,/g, "")),
      range.groups.suf1,
    );
    const max = scale(
      Number(range.groups.max!.replace(/,/g, "")),
      range.groups.suf2 ?? range.groups.suf1,
    );
    const currency =
      mapCurrency(range.groups.cur1) ?? mapCurrency(range.groups.cur2);
    if (currency && min > 0 && max >= min) {
      return { min, max, currency, period };
    }
  }

  const single = singleRe.exec(text);
  if (single?.groups) {
    const amount = scale(
      Number(single.groups.amount!.replace(/,/g, "")),
      single.groups.suf,
    );
    const currency = mapCurrency(single.groups.cur);
    if (currency && amount > 0) {
      return { min: amount, max: amount, currency, period };
    }
  }

  return null;
}

/**
 * Pure rules classification. No network I/O.
 * Bare "Remote" never yields india_eligibility = "open".
 */
export function classifyWithRules(input: {
  title: string;
  descriptionText: string;
  locationRaw?: string | null;
}): ClassificationResult {
  const text = [
    input.title,
    input.locationRaw ? `Location: ${input.locationRaw}` : "",
    input.descriptionText,
  ]
    .filter(Boolean)
    .join("\n\n");

  const india = classifyIndiaEligibility(text);
  const interview = classifyInterview(text);
  const contractor = classifyContractor(text);
  const seniority = classifySeniority(input.title, text);
  const role = classifyRoleFamily(input.title, text);
  const compensation = parseCompensation(text);

  return {
    india_eligibility: india.india_eligibility,
    eligibility_evidence: india.eligibility_evidence,
    remote_scope: india.remote_scope,
    interview_style: interview.interview_style,
    interview_style_evidence: interview.interview_style_evidence,
    contractor_or_eor: contractor.contractor_or_eor,
    contractor_or_eor_evidence: contractor.contractor_or_eor_evidence,
    compensation,
    seniority: seniority.seniority,
    role_family: role.role_family === "other" && !role.evidence
      ? // Keep "other" only when we matched nothing — still a concrete family.
        // Spec allows other; treat unmatched as other (not unknown — unknown is for seniority).
        "other"
      : role.role_family,
  };
}

/** LLM when india unclear OR seniority unknown OR unmapped engineering role. */
export function shouldCallLlm(
  result: ClassificationResult,
  title: string,
  descriptionText: string,
): boolean {
  if (result.india_eligibility === "unclear") return true;
  if (result.seniority === "unknown") return true;
  if (
    result.role_family === "other" &&
    /\b(?:engineer|developer|software)\b/i.test(`${title} ${descriptionText}`)
  ) {
    return true;
  }
  return false;
}
