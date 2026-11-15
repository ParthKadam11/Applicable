/**
 * Shared early-career / geo priority scoring for remote-board discovery.
 * Higher score → promote sooner. Does not ingest board postings as jobs.
 */

const EARLY_RE =
  /\b(?:intern(?:ship)?|trainee|apprentice|junior|jr\.?|associate|fresher|new[\s-]?grad(?:uate)?|graduate|entry[\s-]?level|early[\s-]?career|campus|SDE[\s-]?[I1]\b|SE[\s-]?[I1]\b|0[\s-–—to]+2\s*(?:years?|yrs?)|1\+\s*(?:years?|yrs?)|freshers?\s+welcome)\b/i;

const GEO_RE =
  /\b(?:worldwide|world[\s-]?wide|anywhere|global|india|indian|apac|asia[\s-]?pacific|south[\s-]?asia|bangalore|bengaluru|hyderabad|pune|mumbai|delhi|chennai|remote[\s-]?from[\s-]?india)\b/i;

export function isEarlyCareerText(...parts: Array<string | null | undefined>): boolean {
  return EARLY_RE.test(parts.filter(Boolean).join("\n"));
}

export function isPriorityGeoText(...parts: Array<string | null | undefined>): boolean {
  return GEO_RE.test(parts.filter(Boolean).join("\n"));
}

/** Sort key: early-career first, then India/APAC/worldwide, then ATS-known. */
export function discoveryPriority(input: {
  earlyCareer?: boolean;
  priorityGeo?: boolean;
  hasAts?: boolean;
}): number {
  let score = 0;
  if (input.earlyCareer) score += 4;
  if (input.priorityGeo) score += 2;
  if (input.hasAts) score += 1;
  return score;
}

export function sortByDiscoveryPriority<
  T extends {
    earlyCareer?: boolean;
    priorityGeo?: boolean;
    ats?: string | null;
  },
>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const sa = discoveryPriority({
      earlyCareer: a.earlyCareer,
      priorityGeo: a.priorityGeo,
      hasAts: Boolean(a.ats),
    });
    const sb = discoveryPriority({
      earlyCareer: b.earlyCareer,
      priorityGeo: b.priorityGeo,
      hasAts: Boolean(b.ats),
    });
    return sb - sa;
  });
}
