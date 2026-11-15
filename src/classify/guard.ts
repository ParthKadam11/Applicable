import type { ClassificationResult } from "./types.js";
import { normalizeWhitespace } from "./text.js";

export interface GuardRejection {
  field: string;
  evidence: string;
  reason: string;
}

export interface GuardResult {
  result: ClassificationResult;
  rejections: GuardRejection[];
}

function isSubstring(haystackNorm: string, evidence: string): boolean {
  const needle = normalizeWhitespace(evidence);
  if (!needle) return false;
  return haystackNorm.includes(needle);
}

/**
 * Reject any tag whose evidence is not an exact substring of description_text
 * (whitespace-normalized only). Rejected fields fall back to unclear/unknown/null.
 */
export function guardEvidence(
  descriptionText: string,
  title: string,
  locationRaw: string | null | undefined,
  result: ClassificationResult,
): GuardResult {
  const corpus = normalizeWhitespace(
    [title, locationRaw ? `Location: ${locationRaw}` : "", descriptionText]
      .filter(Boolean)
      .join(" "),
  );

  const rejections: GuardRejection[] = [];
  const next: ClassificationResult = {
    ...result,
    eligibility_evidence: [...result.eligibility_evidence],
    interview_style: [...result.interview_style],
    interview_style_evidence: { ...result.interview_style_evidence },
    compensation: result.compensation ? { ...result.compensation } : null,
  };

  // Evidence required for any decisive india label
  if (
    next.india_eligibility === "open" ||
    next.india_eligibility === "india_remote" ||
    next.india_eligibility === "india_onsite" ||
    next.india_eligibility === "region_locked"
  ) {
    const valid = next.eligibility_evidence.filter((e) =>
      isSubstring(corpus, e),
    );
    const invalid = next.eligibility_evidence.filter(
      (e) => !isSubstring(corpus, e),
    );
    for (const evidence of invalid) {
      rejections.push({
        field: "india_eligibility",
        evidence,
        reason: "evidence not a substring of description",
      });
    }
    if (valid.length === 0) {
      // Prefer a meaningful location_raw as evidence rather than demoting to unclear.
      // Bare "Remote" is never decisive on its own.
      const loc = (locationRaw ?? "").trim();
      const locUsable =
        loc.length >= 3 &&
        !/^remote(?:[- ]friendly)?$/i.test(loc) &&
        isSubstring(corpus, loc);
      if (locUsable) {
        next.eligibility_evidence = [loc];
      } else {
        next.india_eligibility = "unclear";
        next.eligibility_evidence = [];
        next.remote_scope = "unknown";
      }
    } else {
      next.eligibility_evidence = valid;
    }
  } else {
    next.eligibility_evidence = next.eligibility_evidence.filter((e) =>
      isSubstring(corpus, e),
    );
  }

  // interview styles
  const keptStyles: string[] = [];
  const keptEvidence: Record<string, string[]> = {};
  for (const style of next.interview_style) {
    if (style === "unknown") continue;
    const quotes = next.interview_style_evidence[style] ?? [];
    const validQuotes = quotes.filter((e) => isSubstring(corpus, e));
    for (const evidence of quotes) {
      if (!isSubstring(corpus, evidence)) {
        rejections.push({
          field: `interview_style.${style}`,
          evidence,
          reason: "evidence not a substring of description",
        });
      }
    }
    if (validQuotes.length > 0) {
      keptStyles.push(style);
      keptEvidence[style] = validQuotes;
    }
  }
  next.interview_style =
    keptStyles.length > 0
      ? (keptStyles as ClassificationResult["interview_style"])
      : ["unknown"];
  next.interview_style_evidence = keptEvidence;

  // contractor
  if (next.contractor_or_eor === true) {
    const ev = next.contractor_or_eor_evidence;
    if (!ev || !isSubstring(corpus, ev)) {
      if (ev) {
        rejections.push({
          field: "contractor_or_eor",
          evidence: ev,
          reason: "evidence not a substring of description",
        });
      }
      next.contractor_or_eor = false;
      next.contractor_or_eor_evidence = null;
    }
  }

  // compensation has no required quote in schema - leave as-is if present
  // (parsed from text, so numbers aren't "evidence quotes")

  if (rejections.length > 0) {
    for (const r of rejections) {
      console.warn(
        `[classify:guard] rejected ${r.field}: ${r.reason} - "${r.evidence.slice(0, 120)}"`,
      );
    }
  }

  return { result: next, rejections };
}
