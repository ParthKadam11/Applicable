import type { ClassificationResult } from "./types.js";

export type Comp = NonNullable<ClassificationResult["compensation"]>;

/** Reject funding figures, band indices, and other junk parsers pick up. */
export function isPlausibleCompensation(
  min: number | null | undefined,
  max: number | null | undefined,
  period: string | null | undefined,
): boolean {
  const lo = min ?? max;
  const hi = max ?? min;
  if (lo == null || hi == null) return false;
  if (!(lo > 0) || hi < lo) return false;

  const p = (period ?? "year").toLowerCase();
  if (p === "hour") return lo >= 10 && hi <= 2_000;
  // Real monthly cash is almost never six figures USD; higher → mislabeled year.
  if (p === "month") return lo >= 800 && hi <= 40_000;
  // year / unknown
  return lo >= 15_000 && hi <= 2_000_000;
}

function mapCurrency(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const u = raw.toUpperCase();
  if (u === "$" || u === "USD") return "USD";
  if (u === "€" || u === "EUR") return "EUR";
  if (u === "£" || u === "GBP") return "GBP";
  if (u === "INR") return "INR";
  return u.length === 3 ? u : null;
}

function mapInterval(interval: unknown): Comp["period"] {
  if (typeof interval !== "string") return "year";
  const u = interval.toUpperCase();
  if (u.includes("HOUR")) return "hour";
  if (u.includes("MONTH")) return "month";
  if (u.includes("YEAR") || u.includes("ANNUAL")) return "year";
  return "year";
}

function fundingContext(text: string, index: number): boolean {
  const start = Math.max(0, index - 40);
  const end = Math.min(text.length, index + 40);
  return /\b(rais(?:e[ds]?|ing)|funding|series\s+[a-f]|valuation|invest(?:ment|ors?)|back(?:ed)?\s+by)\b/i.test(
    text.slice(start, end),
  );
}

/**
 * Prefer Ashby structured compensation_raw over free-text regex.
 */
export function compensationFromAtsRaw(raw: unknown): Comp | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const tiers = obj.compensationTiers;
  if (Array.isArray(tiers)) {
    for (const tier of tiers) {
      if (!tier || typeof tier !== "object") continue;
      const components = (tier as { components?: unknown }).components;
      if (!Array.isArray(components)) continue;
      for (const c of components) {
        if (!c || typeof c !== "object") continue;
        const comp = c as Record<string, unknown>;
        if (comp.compensationType !== "Salary") continue;
        const minRaw = comp.minValue;
        const maxRaw = comp.maxValue;
        const min =
          typeof minRaw === "number"
            ? minRaw
            : typeof maxRaw === "number"
              ? maxRaw
              : null;
        const max =
          typeof maxRaw === "number"
            ? maxRaw
            : typeof minRaw === "number"
              ? minRaw
              : null;
        if (min == null || max == null) continue;
        const currency = mapCurrency(
          typeof comp.currencyCode === "string" ? comp.currencyCode : "USD",
        );
        const period = mapInterval(comp.interval);
        if (currency && isPlausibleCompensation(min, max, period)) {
          return {
            min: Math.round(min),
            max: Math.round(max),
            currency,
            period,
          };
        }
      }
    }
  }

  const summary = obj.scrapeableCompensationSalarySummary;
  if (typeof summary === "string" && summary.trim()) {
    return parseCompensation(summary);
  }
  return null;
}

/**
 * Extract a salary range from posting text. Skips funding / valuation figures.
 */
function periodNearMatch(text: string, index: number, matchLen: number): Comp["period"] {
  const start = Math.max(0, index - 30);
  const end = Math.min(text.length, index + matchLen + 40);
  const window = text.slice(start, end);
  if (/\bper\s+hour\b|\bhourly\b|\b\/\s*hr\b|\b\/\s*hour\b/i.test(window)) {
    return "hour";
  }
  if (/\bper\s+month\b|\b\/\s*mo(?:nth)?\b|\bper\s+mo\b/i.test(window)) {
    return "month";
  }
  if (/\bper\s+year\b|\bannually\b|\b\/\s*yr\b|\b\/\s*year\b|\ba\s+year\b/i.test(window)) {
    return "year";
  }
  return "year";
}

export function parseCompensation(text: string): Comp | null {
  const rangeRe =
    /(?:(?<cur1>USD|EUR|GBP|INR|\$|€|£)\s*)?(?<min>\d{2,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)\s*(?<suf1>[kKmM])?\s*(?:[-–—]|to)\s*(?:(?<cur2>USD|EUR|GBP|INR|\$|€|£)\s*)?(?<max>\d{2,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)\s*(?<suf2>[kKmM])?/gi;

  const singleRe =
    /(?:(?<cur>USD|EUR|GBP|INR|\$|€|£)\s*)(?<amount>\d{2,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)\s*(?<suf>[kKmM])?/gi;

  const scale = (n: number, suf?: string): number => {
    if (!suf) return Math.round(n);
    const s = suf.toLowerCase();
    if (s === "k") return Math.round(n * 1_000);
    if (s === "m") return Math.round(n * 1_000_000);
    return Math.round(n);
  };

  let m: RegExpExecArray | null;
  while ((m = rangeRe.exec(text)) !== null) {
    if (!m.groups) continue;
    if (fundingContext(text, m.index)) continue;
    const min = scale(
      Number(m.groups.min!.replace(/,/g, "")),
      m.groups.suf1,
    );
    const max = scale(
      Number(m.groups.max!.replace(/,/g, "")),
      m.groups.suf2 ?? m.groups.suf1,
    );
    const currency =
      mapCurrency(m.groups.cur1) ?? mapCurrency(m.groups.cur2);
    // Require currency or k/m suffix — bare "4-4" is never a salary.
    if (!currency && !m.groups.suf1 && !m.groups.suf2) continue;
    let period = periodNearMatch(text, m.index, m[0].length);
    // Six-figure "month" is almost always annual mislabeled from distant "monthly" text.
    if (period === "month" && min >= 20_000) period = "year";
    if (currency && isPlausibleCompensation(min, max, period)) {
      return { min, max, currency, period };
    }
  }

  while ((m = singleRe.exec(text)) !== null) {
    if (!m.groups) continue;
    if (fundingContext(text, m.index)) continue;
    const amount = scale(
      Number(m.groups.amount!.replace(/,/g, "")),
      m.groups.suf,
    );
    const currency = mapCurrency(m.groups.cur);
    let period = periodNearMatch(text, m.index, m[0].length);
    if (period === "month" && amount >= 20_000) period = "year";
    if (currency && isPlausibleCompensation(amount, amount, period)) {
      return { min: amount, max: amount, currency, period };
    }
  }

  return null;
}
