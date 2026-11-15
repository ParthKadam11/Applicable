import { classifyIndiaEligibility } from "./eligibility.js";
import { classifyRoleFamily, isTechRole } from "./roles.js";
import { classifySeniority } from "./seniority.js";
import type { ClassificationResult, InterviewStyle } from "./types.js";
import { sentenceMatching } from "./text.js";
import {
  parseCompensation,
  compensationFromAtsRaw,
  isPlausibleCompensation,
} from "./compensation.js";

export { classifyRoleFamily, isTechRole } from "./roles.js";
export { classifySeniority, isEarlyCareer } from "./seniority.js";
export {
  parseCompensation,
  compensationFromAtsRaw,
  isPlausibleCompensation,
};

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

/**
 * Pure rules classification. No network I/O.
 * Bare "Remote" never yields india_eligibility = "open".
 */
export function classifyWithRules(input: {
  title: string;
  descriptionText: string;
  locationRaw?: string | null;
  isRemoteFlag?: boolean | null;
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
    isRemoteFlag: input.isRemoteFlag,
  });
  const interview = classifyInterview(text);
  const contractor = classifyContractor(text);
  const seniority = classifySeniority(input.title, input.descriptionText);
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
    seniority_evidence: seniority.evidence,
    years_experience_min: seniority.yearsMin,
    years_experience_max: seniority.yearsMax,
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
