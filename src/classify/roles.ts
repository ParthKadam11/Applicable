import type { RoleFamily } from "./types.js";
import { sentenceMatching } from "./text.js";

/** Tech roles included in stats / MCP / LLM. */
export const TECH_ROLE_FAMILIES: ReadonlySet<RoleFamily> = new Set([
  "backend",
  "fullstack",
  "frontend",
  "mobile",
  "infra",
  "ml",
  "data",
  "security",
  "qa",
  "developer_relations",
  "solutions",
  "other",
]);

export function isTechRole(roleFamily: string | null | undefined): boolean {
  if (!roleFamily) return true; // untagged - treat as eligible until classified
  return roleFamily !== "non_tech" && TECH_ROLE_FAMILIES.has(roleFamily as RoleFamily);
}

/**
 * True non-dev titles only. Soft — overridden when the title is clearly
 * engineering (Sales Engineer, Security Engineer, etc.).
 */
const NON_TECH_TITLE: RegExp[] = [
  /\b(?:account executive|ae\b|bdr|sdr)\b/i,
  /\bsales(?:person|people| rep)?\b/i,
  /\bmarketing\b/i,
  /\bgrowth marketing\b/i,
  /\brecruit(?:er|ing)\b/i,
  /\btalent (?:acquisition|partner)\b/i,
  /\bhuman resources\b|\bHRBP\b|(?<![A-Za-z])HR(?![A-Za-z])/i,
  /\bpeople (?:ops|operations|partner)\b/i,
  /\bfinanc(?:e|ial)\b/i,
  /\baccounting\b|\bcontroller\b|\bbookkeep/i,
  /\blegal\b|\bcounsel\b|\battorney\b|\bparalegal\b/i,
  /\boffice manager\b|\bexecutive assistant\b|\bchief of staff\b/i,
  /\bcustomer success\b|\b\bCSM\b/i,
  /\baccount manager\b/i,
  /\bbusiness development\b/i,
  /\boperations manager\b|\bbusiness operations\b|\brevops\b/i,
  /\boperations analyst\b/i,
  /\bproduct designer\b|\bux designer\b|\bui designer\b|\bgraphic designer\b/i,
  /\bbrand designer\b|\bvisual designer\b/i,
  // PM / program — not engineering (unless eng title signal overrides)
  /\bproduct manager\b|\bprogram manager\b|(?<![A-Za-z])TPM(?![A-Za-z])/i,
  /\bproject manager\b/i,
  /\bmedical (?:biller|billing|coder|assistant|officer|director)\b/i,
  /\b(?:nurse|physician|clinician|clinical)\b/i,
  /\bcontent (?:writer|marketing|strategist)\b|\bcopywriter\b/i,
  /\bcommunity manager\b/i,
  // Staffing / AI-training / data-labeling gigs
  /\bai[\s-]?trainer\b/i,
  /\bfreelance\s+ai\s+trainer\b/i,
  /\b(?:data[\s-]?)?label(?:l?ing|er|ing)\b/i,
  /\bannotat(?:or|ion|e|ing)\b/i,
  /\bdialect\s+specialist\b/i,
  /\blanguage\s+(?:specialist|expert|data\s+contributor)\b/i,
  /\b(?:ai\s+)?rater\b/i,
  /\bai\s+tutor\b/i,
  /\b(?:crowd|task)\s*(?:worker|contributor)\b/i,
];

/** Agencies that primarily post labeling / AI-trainer gigs. */
const NON_TECH_AGENCIES: RegExp[] = [
  /\bmeridial\b/i,
  /\boutlier\b/i,
  /\bscale\s*ai\b/i,
  /\bremotasks?\b/i,
  /\bappen\b/i,
  /\blionbridge\b/i,
  /\btelus\s*(?:international)?\b/i,
  /\bclickworker\b/i,
];

/**
 * Engineering title signal. Title wins: description never demotes these.
 * Covers SWE, backend/frontend/FS, mobile, data, ML/AI, DevOps/SRE/platform,
 * security, QA/SDET, solutions/forward-deployed, data science.
 */
const TECH_SIGNAL: RegExp[] = [
  /\bsoftware\b/i,
  /\bengineer(?:ing)?\b/i,
  /\bdeveloper\b/i,
  /\bprogrammer\b/i,
  /(?<![A-Za-z])(?:SWE|SDE|SDET|MTS)(?![A-Za-z])/,
  /\bmember of technical staff\b/i,
  /\bsoftware development(?:\s+engineer)?\b/i,
  /\bsre\b/i,
  /\bdevops\b/i,
  /\bbackend\b|\bfrontend\b|\bfull[- ]?stack\b/i,
  /\bmachine learning\b|\b\bML\b(?:\s+engineer)?/i,
  /\b(?:AI|LLM)\s+engineer\b/i,
  /\bdata scientist\b|\bdata engineer\b|\banalytics engineer\b/i,
  /\bsecurity (?:engineer|analyst|architect)\b/i,
  /\binformation security\b|\bapp(?:lication)?sec\b|\binfosec\b/i,
  /\bqa (?:engineer|lead|manager)\b|\btest engineer\b|\bquality assurance\b/i,
  /\bdeveloper advocate\b|\bdeveloper relations\b|\b\bDevRel\b/i,
  /\bsolutions (?:engineer|architect)\b/i,
  /\bsupport engineer\b|\bsales engineer\b/i,
  /\bforward[\s-]?deployed\s+(?:engineer|architect)\b/i,
  /\b(?:software|solutions|security|data|cloud|platform|systems)\s+architect\b/i,
  /\bplatform engineer\b|\binfrastructure engineer\b/i,
  /\b(?:platform|infrastructure)\s+(?:architect|lead)\b/i,
  /\b(?:founding|staff|principal|senior)\s+infrastructure\b/i,
  /\bsite reliability\b/i,
  /\btechnical (?:lead|leader|staff)\b/i,
  /\bengineering (?:manager|lead|director)\b/i,
];

/** Explicit AI-trainer / labeling / dialect phrasing in the title. */
const STAFFING_TITLE: RegExp =
  /\b(?:ai[\s-]?trainer|freelance\s+ai|dialect\s+specialist|language\s+(?:specialist|expert|data\s+contributor)|(?:data[\s-]?)?label(?:l?ing|er)|annotat(?:or|ion)|(?:ai\s+)?rater|ai\s+tutor)\b/i;

/** Pure eng titles that stay tech at labeling agencies (no trainer phrasing). */
const REAL_ENG_TITLE: RegExp[] = [
  /\b(?:software|backend|frontend|full[\s-]?stack|platform|infrastructure|security|data|ml|machine learning|devops|site reliability)\s+engineer\b/i,
  /\b(?:software|solutions|security|data|cloud|platform|systems)\s+architect\b/i,
  /\bmachine\s+learning\s+engineer\b|\bml\s+engineer\b|\bai\s+engineer\b/i,
  /\bdata scientist\b|\bdata engineer\b/i,
  /(?<![A-Za-z])(?:SWE|SDE|SDET)(?![A-Za-z])/,
  /\bforward[\s-]?deployed\s+(?:engineer|architect)\b/i,
];

/**
 * Staffing / AI-trainer / labeling noise. Stronger than soft title rules:
 * "AI Trainer" must not become ml via \bAI\b patterns.
 */
export function isStaffingNoise(
  title: string,
  companyName = "",
  descriptionText = "",
): boolean {
  const t = title.trim();
  if (!t && !companyName) return false;

  // Explicit trainer/labeling/dialect in the title → always noise.
  if (STAFFING_TITLE.test(t)) return true;

  // Agency + soft labeling signal, unless a pure eng title with no trainer words.
  if (NON_TECH_AGENCIES.some((re) => re.test(companyName))) {
    if (REAL_ENG_TITLE.some((re) => re.test(t))) return false;
    if (
      /\b(?:trainer|annotat|label|dialect|language\s+(?:specialist|expert|data)|rater|tutor|specialist)\b/i.test(
        t,
      ) ||
      /\b(?:ai[\s-]?trainer|data[\s-]?label|annotat|dialect)\b/i.test(
        descriptionText.slice(0, 800),
      )
    ) {
      return true;
    }
  }

  return false;
}

const ROLE_PATTERNS: Array<{ family: RoleFamily; re: RegExp }> = [
  { family: "ml", re: /\bmachine learning\b/i },
  { family: "ml", re: /\bML\s+engineer\b/i },
  { family: "ml", re: /\bAI\s+engineer\b/i },
  { family: "ml", re: /\bLLM\s+engineer\b/i },
  { family: "data", re: /\bdata scientist\b/i },
  { family: "data", re: /\bdata engineer\b/i },
  { family: "data", re: /\banalytics engineer\b/i },
  { family: "infra", re: /\bdevops\b/i },
  { family: "infra", re: /\bsite reliability\b/i },
  { family: "infra", re: /(?<![A-Za-z])SRE(?![A-Za-z])/ },
  { family: "infra", re: /\bplatform engineer\b/i },
  { family: "infra", re: /\binfrastructure engineer\b/i },
  { family: "infra", re: /\b(?:platform|infrastructure)\s+(?:architect|lead)\b/i },
  { family: "infra", re: /\b(?:founding|staff|principal|senior)\s+infrastructure\b/i },
  { family: "infra", re: /\bsite reliability\b/i },
  { family: "security", re: /\bsecurity engineer\b/i },
  { family: "security", re: /\bsecurity (?:analyst|architect)\b/i },
  { family: "security", re: /\binformation security\b/i },
  { family: "security", re: /\bapp(?:lication)?sec\b/i },
  { family: "security", re: /\binfosec\b/i },
  { family: "qa", re: /\bqa (?:engineer|lead|manager)\b/i },
  { family: "qa", re: /\bquality assurance\b/i },
  { family: "qa", re: /\btest(?:ing)? engineer\b/i },
  { family: "qa", re: /\bsdet\b/i },
  { family: "developer_relations", re: /\bdeveloper (?:advocate|relations|experience)\b/i },
  { family: "developer_relations", re: /(?<![A-Za-z])DevRel(?![A-Za-z])/ },
  { family: "solutions", re: /\bsolutions (?:engineer|architect)\b/i },
  { family: "solutions", re: /\bsupport engineer\b/i },
  { family: "solutions", re: /\bsales engineer\b/i },
  { family: "solutions", re: /\bforward[\s-]?deployed\s+(?:engineer|architect)\b/i },
  { family: "solutions", re: /\b(?:software|systems|cloud|platform|solutions)\s+architect\b/i },
  { family: "mobile", re: /\bmobile (?:engineer|developer)\b/i },
  { family: "mobile", re: /\b(?:iOS|Android|Flutter|React Native)\b/i },
  { family: "fullstack", re: /\bfull[- ]?stack\b/i },
  { family: "frontend", re: /\bfront[- ]?end\b/i },
  { family: "backend", re: /\bback[- ]?end\b/i },
  { family: "backend", re: /\bapi engineer\b/i },
  { family: "backend", re: /\bserver[- ]side\b/i },
  { family: "other", re: /(?<![A-Za-z])(?:SWE|SDE|SDET|MTS)(?![A-Za-z])/ },
  { family: "other", re: /\bmember of technical staff\b/i },
  { family: "other", re: /\bsoftware development(?:\s+engineer)?\b/i },
  { family: "other", re: /\btechnical (?:lead|leader)\b/i },
  { family: "other", re: /\bengineering (?:manager|lead|director)\b/i },
];

export function hasTechSignal(title: string): boolean {
  return TECH_SIGNAL.some((re) => re.test(title));
}

function isNonTechTitle(title: string): boolean {
  if (!NON_TECH_TITLE.some((re) => re.test(title))) return false;
  // Engineering title always wins over soft non-tech (Sales Engineer, etc.).
  if (hasTechSignal(title)) return false;
  return true;
}

export function classifyRoleFamily(
  title: string,
  descriptionText = "",
  companyName = "",
): { role_family: RoleFamily; evidence: string | null } {
  if (isStaffingNoise(title, companyName, descriptionText)) {
    return { role_family: "non_tech", evidence: title || companyName || null };
  }

  // PM / program / project manager are non-dev unless the title is also eng.
  if (
    (/\b(?:product|program|project)\s+manager\b|(?<![A-Za-z])TPM(?![A-Za-z])/i.test(
      title,
    ) &&
      !/\b(?:engineer|developer|architect|SWE|SDE|SDET)\b/i.test(title))
  ) {
    return { role_family: "non_tech", evidence: title };
  }

  if (isNonTechTitle(title)) {
    return { role_family: "non_tech", evidence: title };
  }

  // Title wins — match family from title first.
  for (const { family, re } of ROLE_PATTERNS) {
    if (re.test(title)) {
      const sentence = sentenceMatching(title, re) ?? title;
      return { role_family: family, evidence: sentence };
    }
  }

  const engTitle = hasTechSignal(title);
  // Description may refine family for eng titles only — never demote to non_tech.
  if (engTitle && descriptionText) {
    const combined = `${title}\n${descriptionText}`;
    for (const { family, re } of ROLE_PATTERNS) {
      const sentence = sentenceMatching(combined, re);
      if (sentence) return { role_family: family, evidence: sentence };
    }
    return { role_family: "other", evidence: title };
  }

  if (engTitle) {
    return { role_family: "other", evidence: title };
  }

  return { role_family: "non_tech", evidence: title || null };
}
