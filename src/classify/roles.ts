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
  if (!roleFamily) return true; // untagged — treat as eligible until classified
  return roleFamily !== "non_tech" && TECH_ROLE_FAMILIES.has(roleFamily as RoleFamily);
}

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
  /\bproduct designer\b|\bux designer\b|\bui designer\b|\bgraphic designer\b/i,
  /\bbrand designer\b|\bvisual designer\b/i,
  /\bcontent (?:writer|marketing|strategist)\b|\bcopywriter\b/i,
  /\bcommunity manager\b/i,
];

/** Explicit engineering signal that overrides a soft non-tech match. */
const TECH_SIGNAL: RegExp[] = [
  /\bsoftware\b/i,
  /\bengineer(?:ing)?\b/i,
  /\bdeveloper\b/i,
  /\bprogrammer\b/i,
  /\bsre\b/i,
  /\bdevops\b/i,
  /\bbackend\b|\bfrontend\b|\bfull[- ]?stack\b/i,
  /\bmachine learning\b|\b\bML\b|\b\bAI\b/i,
  /\bsecurity engineer\b/i,
  /\bqa engineer\b|\btest engineer\b/i,
  /\bdeveloper advocate\b|\bdeveloper relations\b|\b\bDevRel\b/i,
  /\bsolutions engineer\b|\bsupport engineer\b|\bsales engineer\b/i,
];

const ROLE_PATTERNS: Array<{ family: RoleFamily; re: RegExp }> = [
  { family: "ml", re: /\bmachine learning\b/i },
  { family: "ml", re: /\b\bML\b(?:\s+engineer)?/ },
  { family: "ml", re: /\b\bAI\b(?:\s+engineer)?/ },
  { family: "ml", re: /\bLLM\b/ },
  { family: "data", re: /\bdata scientist\b/i },
  { family: "data", re: /\bdata engineer\b/i },
  { family: "data", re: /\banalytics engineer\b/i },
  { family: "infra", re: /\bdevops\b/i },
  { family: "infra", re: /\bsite reliability\b/i },
  { family: "infra", re: /\b\bSRE\b/ },
  { family: "infra", re: /\binfrastructure\b/i },
  { family: "infra", re: /\bplatform engineer\b/i },
  { family: "security", re: /\bsecurity engineer\b/i },
  { family: "security", re: /\bapp(?:lication)?sec\b/i },
  { family: "security", re: /\binfosec\b/i },
  { family: "qa", re: /\bqa engineer\b/i },
  { family: "qa", re: /\bquality assurance\b/i },
  { family: "qa", re: /\btest(?:ing)? engineer\b/i },
  { family: "qa", re: /\bsdet\b/i },
  { family: "developer_relations", re: /\bdeveloper (?:advocate|relations|experience)\b/i },
  { family: "developer_relations", re: /\b\bDevRel\b/ },
  { family: "solutions", re: /\bsolutions engineer\b/i },
  { family: "solutions", re: /\bsupport engineer\b/i },
  { family: "solutions", re: /\bsales engineer\b/i },
  { family: "solutions", re: /\bforward deployed engineer\b/i },
  { family: "mobile", re: /\bmobile (?:engineer|developer)\b/i },
  { family: "mobile", re: /\b(?:iOS|Android|Flutter|React Native)\b/i },
  { family: "fullstack", re: /\bfull[- ]?stack\b/i },
  { family: "frontend", re: /\bfront[- ]?end\b/i },
  { family: "frontend", re: /\breact\b/i },
  { family: "backend", re: /\bback[- ]?end\b/i },
  { family: "backend", re: /\bapi engineer\b/i },
  { family: "backend", re: /\bserver[- ]side\b/i },
];

function hasTechSignal(title: string): boolean {
  return TECH_SIGNAL.some((re) => re.test(title));
}

function isNonTechTitle(title: string): boolean {
  if (!NON_TECH_TITLE.some((re) => re.test(title))) return false;
  // "Sales Engineer" / "Security Engineer" etc. stay tech.
  if (hasTechSignal(title) && /\bengineer\b/i.test(title)) return false;
  return true;
}

export function classifyRoleFamily(
  title: string,
  descriptionText = "",
): { role_family: RoleFamily; evidence: string | null } {
  if (isNonTechTitle(title)) {
    return { role_family: "non_tech", evidence: title };
  }

  const combined = `${title}\n${descriptionText}`;
  for (const { family, re } of ROLE_PATTERNS) {
    // Prefer title matches.
    if (re.test(title)) {
      const sentence = sentenceMatching(title, re) ?? title;
      return { role_family: family, evidence: sentence };
    }
  }
  for (const { family, re } of ROLE_PATTERNS) {
    const sentence = sentenceMatching(combined, re);
    if (sentence) return { role_family: family, evidence: sentence };
  }

  if (hasTechSignal(title) || /\bsoftware\b/i.test(title)) {
    return { role_family: "other", evidence: title };
  }

  // No engineering signal → exclude from tech stats.
  return { role_family: "non_tech", evidence: title || null };
}
