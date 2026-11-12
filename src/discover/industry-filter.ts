import { classifyRoleFamily } from "../classify/roles.js";

/** Minimum share of open jobs that must look tech; below → reject. */
export const MIN_TECH_JOB_RATIO = 0.15;

/**
 * Non-software industry signals on company name / domain / slug.
 * Word-boundary-ish patterns to catch dental clinics, pharma, construction, etc.
 */
export const NON_SOFTWARE_INDUSTRY_PATTERNS: RegExp[] = [
  // Healthcare providers / dental / clinics
  /\bdental\b/i,
  /\bdentist\b/i,
  /\northodont/i,
  /\bhospital\b/i,
  /\bclinic\b/i,
  /\bhealthcare\b/i,
  /\bhealth\s*care\b/i,
  /\bnursing\b/i,
  /\bphysician\b/i,
  /\bmedical\s*group\b/i,
  /\burgent\s*care\b/i,
  /\bwellbe\s*health\b/i,
  /\bwelbehealth\b/i,
  /\bhomecare\b/i,
  /\bhome\s*care\b/i,
  // Pharma / biotech / therapeutics
  /\bpharma\b/i,
  /\bpharmaceutical\b/i,
  /\bbiotech\b/i,
  /\bbiologics?\b/i,
  /\btherapeutics?\b/i,
  /\bmedicines?\b/i,
  /\boncology\b/i,
  /\bclinical\s*trial/i,
  // Construction / building / materials
  /\bconstruction\b/i,
  /\bbuilding\s*envelope\b/i,
  /\boldcastle\b/i,
  /\broofing\b/i,
  /\bhvac\b/i,
  /\bconcrete\b/i,
  /\bexcavation\b/i,
  /\bgeneral\s*contractor\b/i,
  // Manufacturing / batteries / industrial hardware
  /\bmanufactur/i,
  /\bbatter(?:y|ies)\b/i,
  /\bsemiconductor\b/i,
  /\bfactory\b/i,
  /\bindustrial\s*(?:equip|machinery)\b/i,
  /\bgotion\b/i,
  // Food / restaurants / delivery ops (not foodtech SaaS alone - need ops signals)
  /\brestaurant\b/i,
  /\bcatering\b/i,
  /\bfood\s*delivery\b/i,
  /\bcookunity\b/i,
  /\bgrocery\b/i,
  /\bsupermarket\b/i,
  // Staffing / recruiting agencies
  /\bstaffing\b/i,
  /\brecruiting\s*agency\b/i,
  /\btalent\s*agency\b/i,
  /\bworkforce\s*solutions\b/i,
  /\btemporary\s*(?:staff|labor)\b/i,
];

export function industryKeywordHit(
  ...parts: Array<string | null | undefined>
): string | null {
  const blob = parts.filter(Boolean).join(" ").trim();
  if (!blob) return null;
  for (const re of NON_SOFTWARE_INDUSTRY_PATTERNS) {
    if (re.test(blob)) {
      const m = blob.match(re);
      return m?.[0] ?? re.source;
    }
  }
  return null;
}

export function techJobRatio(titles: string[]): {
  total: number;
  tech: number;
  ratio: number;
} {
  const total = titles.filter((t) => t.trim().length > 0).length;
  if (total === 0) return { total: 0, tech: 0, ratio: 1 };
  let tech = 0;
  for (const title of titles) {
    const { role_family } = classifyRoleFamily(title);
    if (role_family !== "non_tech") tech += 1;
  }
  return { total, tech, ratio: tech / total };
}

export type IndustryFilterResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Reject clearly non-software industries by name/domain, and boards with
 * fewer than MIN_TECH_JOB_RATIO tech-looking open roles.
 */
export function evaluateIndustryFilter(input: {
  name?: string | null;
  domain?: string | null;
  atsSlug?: string | null;
  jobTitles?: string[] | null;
}): IndustryFilterResult {
  const hit = industryKeywordHit(input.name, input.domain, input.atsSlug);
  if (hit) {
    return {
      ok: false,
      reason: `non-software industry (${hit.toLowerCase()})`,
    };
  }

  const titles = input.jobTitles ?? [];
  if (titles.length > 0) {
    const { total, tech, ratio } = techJobRatio(titles);
    if (total >= 3 && ratio < MIN_TECH_JOB_RATIO) {
      return {
        ok: false,
        reason: `low tech ratio (${tech}/${total} = ${(ratio * 100).toFixed(0)}% < 15%)`,
      };
    }
  }

  return { ok: true };
}
