import { describe, expect, it } from "vitest";
import {
  acceptLlmCrosscheckCorrection,
  classifyEvidenceFailure,
  evidenceNamesCountryOrRegionRestriction,
  isFundingOrInvestorEvidence,
  selectBestEligibilityEvidence,
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
    expect(v.reason).toBe("funding_investor");
  });

  it("rejects contractor gear / benefits as eligibility evidence", () => {
    const evidence =
      "As a contractor you’ll supply a secure computer and high‑speed internet; company‑sponsored benefits";
    expect(classifyEvidenceFailure(evidence, "Eng", "World Wide - Remote", evidence)).toBe(
      "contractor_gear",
    );
  });

  it("prefers location_raw over bad description evidence", () => {
    const picked = selectBestEligibilityEvidence({
      title: "Engineer",
      locationRaw: "World Wide - Remote",
      descriptionText:
        "As a contractor you’ll supply a secure computer and high‑speed internet; company‑sponsored benefits are not included.",
      candidates: [
        "As a contractor you’ll supply a secure computer and high‑speed internet; company‑sponsored benefits are not included.",
      ],
    });
    expect(picked.source).toBe("location_raw");
    expect(picked.evidence).toBe("World Wide - Remote");
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
  it("does not learn funding Sequoia India phrases", () => {
    const phrase = extractPatternPhrase(
      "We are not affiliated with Sequoia India investors",
    );
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

  it("drops NY city-only llm_crosscheck noise", () => {
    expect(evidenceNamesCountryOrRegionRestriction("Location: New York, NY")).toBe(
      false,
    );
    const r = acceptLlmCrosscheckCorrection({
      evidence: "Location: New York, NY",
      title: "Eng",
      locationRaw: "New York, NY",
      descriptionText: "Location: New York, NY\nBuild things.",
      confidence: 0.95,
      newLabel: "india_onsite",
    });
    expect(r.ok).toBe(false);
  });

  it("accepts high-confidence country restriction", () => {
    const r = acceptLlmCrosscheckCorrection({
      evidence: "Must be based in Argentina",
      title: "Eng",
      locationRaw: "Argentina (Remote)",
      descriptionText: "Must be based in Argentina. Remote ok.",
      confidence: 0.9,
      newLabel: "region_locked",
    });
    expect(r.ok).toBe(true);
  });
});
