import { normalizeWhitespace } from "../classify/text.js";
import { assertFactEvidence, quoteAround } from "./evidence.js";
import type { ExtractedFact, SourceKind } from "./types.js";

function pushIfValid(
  out: ExtractedFact[],
  fact: ExtractedFact,
  sourceText: string,
): void {
  if (
    assertFactEvidence({
      quote: fact.quote,
      sourceUrl: fact.sourceUrl,
      sourceText,
    })
  ) {
    out.push(fact);
  }
}

/** Rule/regex extraction from free text (ATS JD, about page, etc.). */
export function extractFactsFromText(input: {
  text: string;
  sourceUrl: string;
  sourceKind: SourceKind;
}): ExtractedFact[] {
  const text = input.text;
  if (!text || text.length < 20) return [];
  const out: ExtractedFact[] = [];
  const { sourceUrl, sourceKind } = input;

  // HQ / based in
  const hqRe =
    /\b(?:headquartered|headquarters|based)\s+in\s+([A-Z][A-Za-z .,'-]{2,60})/gi;
  let m: RegExpExecArray | null;
  while ((m = hqRe.exec(text)) !== null) {
    const value = normalizeWhitespace(m[1]!).replace(/[.,;]+$/, "");
    pushIfValid(
      out,
      {
        factType: "hq",
        value,
        sourceUrl,
        quote: quoteAround(text, m.index, m[0].length),
        sourceKind,
        confidence: 0.85,
        city: value.split(",")[0]?.trim(),
        country: value.includes(",")
          ? value.split(",").slice(-1)[0]?.trim()
          : undefined,
      },
      text,
    );
  }

  // Founded year
  const yearRe =
    /\b(?:founded|established|since)\s+(?:in\s+)?((?:19|20)\d{2})\b/gi;
  while ((m = yearRe.exec(text)) !== null) {
    pushIfValid(
      out,
      {
        factType: "founded_year",
        value: m[1]!,
        sourceUrl,
        quote: quoteAround(text, m.index, m[0].length),
        sourceKind,
        confidence: 0.9,
      },
      text,
    );
  }

  // Team size
  const teamRe =
    /\b(?:team of|we're|we are)\s+(\d{1,5})\+?\s+(?:people|employees|teammates)\b/gi;
  while ((m = teamRe.exec(text)) !== null) {
    pushIfValid(
      out,
      {
        factType: "team_size",
        value: m[1]!,
        sourceUrl,
        quote: quoteAround(text, m.index, m[0].length),
        sourceKind,
        confidence: 0.75,
      },
      text,
    );
  }
  const teamRe2 =
    /\b(\d{1,5})\+?\s+(?:person|people|employee)\s+team\b/gi;
  while ((m = teamRe2.exec(text)) !== null) {
    pushIfValid(
      out,
      {
        factType: "team_size",
        value: m[1]!,
        sourceUrl,
        quote: quoteAround(text, m.index, m[0].length),
        sourceKind,
        confidence: 0.75,
      },
      text,
    );
  }

  // Investors / funding — split lists; keep short firm-like names only
  const backedRe =
    /\b(?:backed by|investors?(?:\s+include)?|funded by)\s+([A-Z][^.\n]{2,120})/gi;
  while ((m = backedRe.exec(text)) !== null) {
    const chunk = m[1]!;
    const parts = chunk
      .split(/,| and | & |;/i)
      .map((s) => s.replace(/[.,;:]+$/g, "").trim())
      .filter((s) => s.length >= 2 && s.length <= 48)
      .filter((s) => /^[A-Z]/.test(s))
      .filter((s) => !/^(we|our|the|a|an|angels?|leading)\b/i.test(s));
    for (const raw of parts.slice(0, 6)) {
      pushIfValid(
        out,
        {
          factType: "investor",
          value: raw,
          sourceUrl,
          quote: quoteAround(text, m!.index, m![0].length),
          sourceKind,
          confidence: 0.8,
        },
        text,
      );
    }
  }
  const seriesRe =
    /\b(Series\s+[A-F]|Seed|Pre-?Seed)\s+(?:round\s+)?(?:led by|from)\s+([A-Z][A-Za-z0-9 &./'-]{2,60})/gi;
  while ((m = seriesRe.exec(text)) !== null) {
    pushIfValid(
      out,
      {
        factType: "investor",
        value: m[2]!.replace(/[.,;]+$/, "").trim(),
        sourceUrl,
        quote: quoteAround(text, m.index, m[0].length),
        sourceKind,
        confidence: 0.85,
        round: m[1]!,
      },
      text,
    );
  }
  const formerlyRe = /\bformerly\s+Sequoia\s+India\b/gi;
  while ((m = formerlyRe.exec(text)) !== null) {
    pushIfValid(
      out,
      {
        factType: "investor",
        value: "Peak XV Partners",
        sourceUrl,
        quote: quoteAround(text, m.index, m[0].length),
        sourceKind,
        confidence: 0.95,
      },
      text,
    );
  }
  const peakRe = /\bPeak\s+XV(?:\s+Partners)?\b/gi;
  while ((m = peakRe.exec(text)) !== null) {
    pushIfValid(
      out,
      {
        factType: "investor",
        value: "Peak XV Partners",
        sourceUrl,
        quote: quoteAround(text, m.index, m[0].length),
        sourceKind,
        confidence: 0.9,
      },
      text,
    );
  }

  // Founders
  const founderRe =
    /\b(?:co-?founders?|founders?)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}(?:\s+(?:and|&)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})*)/g;
  while ((m = founderRe.exec(text)) !== null) {
    const names = m[1]!.split(/\s+(?:and|&)\s+/i);
    for (const name of names) {
      const n = name.trim();
      if (n.split(/\s+/).length < 2) continue;
      pushIfValid(
        out,
        {
          factType: "founder",
          value: n,
          sourceUrl,
          quote: quoteAround(text, m!.index, m![0].length),
          sourceKind,
          confidence: 0.7,
          role: "founded",
          title: "Founder",
        },
        text,
      );
    }
  }

  return out;
}

/** Prefer about-us / footer-ish sections from a long JD. */
export function extractAboutSections(descriptionHtmlOrText: string): string {
  const text = descriptionHtmlOrText
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
  const plain = normalizeWhitespace(text);
  const markers =
    /(?:about us|about the company|who we are|our story|our mission|backed by|investors?|founded)/i;
  const idx = plain.search(markers);
  if (idx < 0) return plain.slice(0, 4000);
  return plain.slice(Math.max(0, idx - 100), idx + 3500);
}
