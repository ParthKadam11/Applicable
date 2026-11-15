import { describe, expect, it } from "vitest";
import { quoteIsSubstring } from "../../src/enrich/evidence.js";
import { extractFactsFromText } from "../../src/enrich/extract-rules.js";
import {
  canonicalInvestorName,
  normalizeName,
} from "../../src/enrich/normalize.js";
import { isFundingOrInvestorEvidence } from "../../src/learn/evidence-guard.js";

describe("enrich extract-rules", () => {
  it("extracts investor with quote substring (Lumino-style)", () => {
    const text =
      "About us. Peak XV (formerly Sequoia India) led our Series B. We hire globally.";
    const facts = extractFactsFromText({
      text,
      sourceUrl: "https://example.com/jobs/1",
      sourceKind: "ats_jd",
    });
    const inv = facts.filter((f) => f.factType === "investor");
    expect(inv.length).toBeGreaterThan(0);
    expect(inv.some((f) => /Peak XV/i.test(f.value))).toBe(true);
    for (const f of inv) {
      expect(quoteIsSubstring(f.quote, text)).toBe(true);
    }
  });

  it("drops list-prose investor captures", () => {
    const text =
      "We are backed by world-class investors and top VCs including industry leaders.";
    const facts = extractFactsFromText({
      text,
      sourceUrl: "https://example.com/about",
      sourceKind: "website",
    });
    const inv = facts.filter((f) => f.factType === "investor");
    expect(inv).toHaveLength(0);
  });

  it("keeps known VC from backed-by cue", () => {
    const text = "Acme is backed by Accel and Sequoia Capital.";
    const facts = extractFactsFromText({
      text,
      sourceUrl: "https://example.com/about",
      sourceKind: "website",
    });
    const vals = facts
      .filter((f) => f.factType === "investor")
      .map((f) => f.value);
    expect(vals.some((v) => /Accel/i.test(v))).toBe(true);
    expect(vals.some((v) => /Sequoia/i.test(v))).toBe(true);
  });

  it("extracts known VCs nested in parenthetical after top VCs prose", () => {
    const text =
      "We're backed by top VCs (Khosla Ventures, Bain Capital Ventures).";
    const facts = extractFactsFromText({
      text,
      sourceUrl: "https://example.com/jobs/1",
      sourceKind: "ats_jd",
    });
    const vals = facts
      .filter((f) => f.factType === "investor")
      .map((f) => f.value);
    expect(vals).not.toContain("top VCs");
    expect(vals.some((v) => /Khosla/i.test(v))).toBe(true);
    expect(vals.some((v) => /Bain Capital/i.test(v))).toBe(true);
  });

  it("extracts founded year and HQ", () => {
    const text =
      "We are headquartered in San Francisco, CA. Founded in 2018 by Alice Example.";
    const facts = extractFactsFromText({
      text,
      sourceUrl: "https://example.com/about",
      sourceKind: "website",
    });
    expect(facts.some((f) => f.factType === "founded_year" && f.value === "2018")).toBe(
      true,
    );
    expect(facts.some((f) => f.factType === "hq")).toBe(true);
  });

  it("rejects facts whose quote is not in source", () => {
    expect(quoteIsSubstring("not in text", "hello world")).toBe(false);
  });
});

describe("investor alias dedupe", () => {
  it("maps Sequoia India → Peak XV Partners", () => {
    const a = canonicalInvestorName("Sequoia India");
    const b = canonicalInvestorName("Peak XV Partners");
    expect(a.normalized).toBe(b.normalized);
    expect(a.name).toBe("Peak XV Partners");
  });

  it("normalizeName collapses whitespace/case", () => {
    expect(normalizeName("  Accel  Partners ")).toBe("accel partners");
  });
});

describe("funding excluded from location evidence", () => {
  it("treats Peak XV / formerly Sequoia India as funding not location", () => {
    expect(
      isFundingOrInvestorEvidence(
        "Peak XV (formerly Sequoia India) led our Series B funding round.",
      ),
    ).toBe(true);
    expect(isFundingOrInvestorEvidence("Based in Colombia")).toBe(false);
  });
});
