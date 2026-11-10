import { classifyIndiaEligibility } from "./eligibility.js";
import { classifyRoleFamily, isTechRole } from "./roles.js";
import type {
  ClassificationResult,
  InterviewStyle,
  Seniority,
} from "./types.js";
import { sentenceMatching } from "./text.js";

export { classifyRoleFamily, isTechRole } from "./roles.js";

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
    return { interview_style: ["unknown"], interview_style_evidence: {} };
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

export function parseCompensation(text: string): ClassificationResult["compensation"] {
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

  const india = classifyIndiaEligibility({
    title: input.title,
    descriptionText: input.descriptionText,
    locationRaw: input.locationRaw,
  });
  const interview = classifyInterview(text);
  const contractor = classifyContractor(text);
  const seniority = classifySeniority(input.title, text);
  const role = classifyRoleFamily(input.title, input.descriptionText);
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
    role_family: role.role_family,
  };
}

/** LLM only when india eligibility is still unclear after rules (tech roles only). */
export function shouldCallLlm(
  result: ClassificationResult,
  _title?: string,
  _descriptionText?: string,
): { call: boolean; reason: string } {
  if (!isTechRole(result.role_family)) {
    return { call: false, reason: "skip llm: role_family=non_tech" };
  }
  if (result.india_eligibility === "unclear") {
    return { call: true, reason: "india_eligibility=unclear" };
  }
  return {
    call: false,
    reason: `skip llm: india=${result.india_eligibility} (rules confident)`,
  };
}
