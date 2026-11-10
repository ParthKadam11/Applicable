import { describe, expect, it } from "vitest";
import { guardEvidence } from "../../src/classify/guard.js";
import type { ClassificationResult } from "../../src/classify/types.js";

const base: ClassificationResult = {
  india_eligibility: "open",
  eligibility_evidence: ["Candidates in India are welcome to apply."],
  remote_scope: "country",
  interview_style: ["take_home"],
  interview_style_evidence: {
    take_home: ["Interview includes a take-home assignment."],
  },
  contractor_or_eor: true,
  contractor_or_eor_evidence: "We hire via Deel in 100+ countries.",
  compensation: null,
  seniority: "senior",
  role_family: "backend",
};

describe("guardEvidence", () => {
  it("keeps tags when evidence is a substring (whitespace-normalized)", () => {
    const description = `
      Candidates in India are welcome to apply.
      Interview includes a take-home assignment.
      We hire via Deel in 100+ countries.
    `;
    const { result, rejections } = guardEvidence(
      description,
      "Senior Backend Engineer",
      null,
      base,
    );
    expect(rejections).toHaveLength(0);
    expect(result.india_eligibility).toBe("open");
    expect(result.contractor_or_eor).toBe(true);
    expect(result.interview_style).toContain("take_home");
  });

  it("rejects fabricated eligibility evidence → unclear", () => {
    const { result, rejections } = guardEvidence(
      "This is a remote role with great benefits.",
      "Engineer",
      "Remote",
      {
        ...base,
        eligibility_evidence: ["Open to candidates worldwide including India."],
      },
    );
    expect(rejections.some((r) => r.field === "india_eligibility")).toBe(true);
    expect(result.india_eligibility).toBe("unclear");
    expect(result.eligibility_evidence).toEqual([]);
  });

  it("rejects bad interview evidence and drops that style", () => {
    const { result, rejections } = guardEvidence(
      "We have a friendly culture.",
      "Engineer",
      null,
      {
        ...base,
        india_eligibility: "unclear",
        eligibility_evidence: [],
        contractor_or_eor: false,
        contractor_or_eor_evidence: null,
        interview_style: ["dsa"],
        interview_style_evidence: {
          dsa: ["Hard leetcode rounds every day."],
        },
      },
    );
    expect(rejections.some((r) => r.field.startsWith("interview_style"))).toBe(
      true,
    );
    expect(result.interview_style).toEqual(["unknown"]);
  });

  it("rejects bad contractor evidence → false", () => {
    const { result, rejections } = guardEvidence(
      "Full-time employment only.",
      "Engineer",
      null,
      {
        ...base,
        india_eligibility: "unclear",
        eligibility_evidence: [],
        interview_style: ["unknown"],
        interview_style_evidence: {},
        contractor_or_eor_evidence: "Paid through Remote.com EOR.",
      },
    );
    expect(rejections.some((r) => r.field === "contractor_or_eor")).toBe(true);
    expect(result.contractor_or_eor).toBe(false);
    expect(result.contractor_or_eor_evidence).toBeNull();
  });
});
