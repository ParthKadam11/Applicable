import { eq, sql } from "drizzle-orm";
import type { IndiaEligibility } from "../classify/types.js";
import type { Db } from "../db/client.js";
import { learnedPatterns } from "../db/schema.js";
import { normalizeWhitespace } from "../classify/text.js";
import { isFundingOrInvestorEvidence } from "./evidence-guard.js";

const STOP = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "to",
  "of",
  "in",
  "for",
  "on",
  "at",
  "is",
  "are",
  "with",
  "this",
  "that",
  "we",
  "our",
  "you",
  "your",
]);

/**
 * Extract a short memorable phrase from correction evidence.
 * Prefers known eligibility n-grams; falls back to a trimmed window.
 */
export function extractPatternPhrase(evidence: string): string | null {
  const e = normalizeWhitespace(evidence);
  if (!e || e.length < 4) return null;
  if (isFundingOrInvestorEvidence(e)) return null;

  const known: RegExp[] = [
    /\bformerly\s+Sequoia\s+India\b/i,
    /\bSequoia\s+India\b/i,
    /\bUS\s+work\s+authorization\s+required\b/i,
    /\bmust\s+be\s+(?:located|based)\s+in\s+the\s+(?:US|United\s+States)\b/i,
    /\bopen\s+to\s+candidates\s+(?:from\s+|in\s+)?India\b/i,
    /\bhire(?:s|ing)?\s+(?:in|from)\s+India\b/i,
    /\bRemote\s*[-–—:/]\s*India\b/i,
    /\bwork\s+from\s+anywhere\b/i,
    /\b(?:EMEA|APAC|LATAM|AMER)\s+only\b/i,
    /\bmust\s+be\s+based\s+in\s+[A-Z][A-Za-z\s,]{2,40}/i,
    /\bcandidates?\s+(?:must|should)\s+be\s+(?:based|located)\s+in\s+[A-Za-z\s,]{2,40}/i,
    /\bArgentina(?:\/Uruguay)?(?:\s*\(Remote\))?\b/i,
    /\b(?:Brazil|Mexico|Chile|Colombia|Uruguay)\b/i,
  ];
  for (const re of known) {
    const m = e.match(re);
    if (m?.[0]) return normalizeWhitespace(m[0]).slice(0, 120);
  }

  // Window around India / region keywords
  const anchor =
    e.search(
      /\b(?:India|EMEA|APAC|authorization|visa|worldwide|anywhere|Remote)\b/i,
    );
  if (anchor >= 0) {
    const start = Math.max(0, anchor - 24);
    const end = Math.min(e.length, anchor + 64);
    const window = normalizeWhitespace(e.slice(start, end));
    if (window.length >= 8 && !isFundingOrInvestorEvidence(window)) {
      return window.slice(0, 120);
    }
  }

  // Fallback: first 8 content tokens
  const tokens = e
    .split(/\s+/)
    .map((t) => t.replace(/[^a-zA-Z0-9\-']/g, ""))
    .filter((t) => t.length > 1 && !STOP.has(t.toLowerCase()));
  if (tokens.length < 2) return null;
  return tokens.slice(0, 8).join(" ").slice(0, 120);
}

export type PatternHit = {
  phrase: string;
  label: IndiaEligibility;
  weight: number;
  hit_count: number;
};

export async function upsertPatternFromEvidence(
  db: Db,
  evidence: string,
  label: IndiaEligibility,
  weightDelta = 1,
): Promise<PatternHit | null> {
  const phrase = extractPatternPhrase(evidence);
  if (!phrase) return null;

  const [existing] = await db
    .select()
    .from(learnedPatterns)
    .where(eq(learnedPatterns.phrase, phrase))
    .limit(1);

  if (existing) {
    const sameLabel = existing.label === label;
    const [row] = await db
      .update(learnedPatterns)
      .set({
        label: sameLabel ? existing.label : label,
        weight: sameLabel
          ? Number(existing.weight) + weightDelta
          : Math.max(1, Number(existing.weight) * 0.5 + weightDelta),
        hitCount: Number(existing.hitCount) + 1,
        updatedAt: new Date(),
      })
      .where(eq(learnedPatterns.id, existing.id))
      .returning();
    return row
      ? {
          phrase: row.phrase,
          label: row.label as IndiaEligibility,
          weight: Number(row.weight),
          hit_count: Number(row.hitCount),
        }
      : null;
  }

  const [row] = await db
    .insert(learnedPatterns)
    .values({
      phrase,
      label,
      weight: weightDelta,
      hitCount: 1,
    })
    .returning();
  return row
    ? {
        phrase: row.phrase,
        label: row.label as IndiaEligibility,
        weight: Number(row.weight),
        hit_count: Number(row.hitCount),
      }
    : null;
}

export async function loadPatterns(
  db: Db,
  opts?: { excludeJobIds?: Set<string> },
): Promise<PatternHit[]> {
  // Patterns table itself has no job_id — leakage is prevented at correction write time.
  void opts;
  const rows = await db
    .select()
    .from(learnedPatterns)
    .orderBy(sql`${learnedPatterns.weight} DESC`);
  return rows.map((r) => ({
    phrase: r.phrase,
    label: r.label as IndiaEligibility,
    weight: Number(r.weight),
    hit_count: Number(r.hitCount),
  }));
}

/** Match posting text against learned phrases (longest / highest weight wins). */
export function matchPatterns(
  text: string,
  patterns: PatternHit[],
  minWeight = 1,
): PatternHit | null {
  const hay = normalizeWhitespace(text).toLowerCase();
  if (!hay) return null;
  let best: PatternHit | null = null;
  for (const p of patterns) {
    if (p.weight < minWeight) continue;
    const needle = normalizeWhitespace(p.phrase).toLowerCase();
    if (!needle || needle.length < 4) continue;
    if (!hay.includes(needle)) continue;
    if (
      !best ||
      p.weight > best.weight ||
      (p.weight === best.weight && p.phrase.length > best.phrase.length)
    ) {
      best = p;
    }
  }
  return best;
}
