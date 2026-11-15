import { describe, expect, it } from "vitest";
import {
  isFundingOrInvestorEvidence,
  validateEligibilityEvidence,
} from "../../src/learn/evidence-guard.js";
import { extractPatternPhrase } from "../../src/learn/patterns.js";

describe("evidence guard (learning)", () => {
  it("rejects Lumino-style Sequoia India funding text", () => {
    const evidence =
      "Peak XV (formerly Sequoia India) led our Series B funding round.";
    expect(isFundingOrInvestorEvidence(evidence)).toBe(true);
    const v = validateEligibilityEvidence({
      evidence,
      title: "Software Engineer",
      locationRaw: "Remote",
      descriptionText: `About us\n${evidence}\nWe hire globally.`,
    });
    expect(v.ok).toBe(false);
    expect(v.reason).toBe("funding_or_investor");
  });

  it("accepts real India hire eligibility quote", () => {
    const evidence = "Open to candidates from India";
    const desc = `Location: Remote\n${evidence}. Competitive salary.`;
    const v = validateEligibilityEvidence({
      evidence,
      title: "Backend Engineer",
      locationRaw: "Remote",
      descriptionText: desc,
    });
    expect(v.ok).toBe(true);
  });

  it("rejects fabricated evidence not in posting", () => {
    const v = validateEligibilityEvidence({
      evidence: "Must be based in Berlin, Germany",
      title: "Engineer",
      locationRaw: "Remote",
      descriptionText: "A remote role for builders worldwide.",
    });
    expect(v.ok).toBe(false);
    expect(v.reason).toBe("not_substring");
  });
});

describe("pattern extraction", () => {
  it("extracts Sequoia India as a phrase (for rejection patterns)", () => {
    const phrase = extractPatternPhrase(
      "We are not affiliated with Sequoia India investors",
    );
    // Funding evidence → null (should not learn from investor text)
    expect(phrase).toBeNull();
  });

  it("extracts US work authorization phrase", () => {
    const phrase = extractPatternPhrase(
      "US work authorization required for this role.",
    );
    expect(phrase?.toLowerCase()).toContain("us work authorization");
  });

  it("extracts open to candidates from India", () => {
    const phrase = extractPatternPhrase(
      "We are open to candidates from India for this remote role.",
    );
    expect(phrase?.toLowerCase()).toMatch(/open to candidates.*india/);
  });
});
