import { describe, expect, it } from "vitest";
import { classifyWithRules } from "../../src/classify/rules.js";
import { CLASSIFY_FIXTURES } from "../fixtures/classify-descriptions.js";

describe("classifyWithRules", () => {
  for (const fixture of CLASSIFY_FIXTURES) {
    it(`${fixture.id} → ${fixture.expect.india_eligibility}`, () => {
      const result = classifyWithRules({
        title: fixture.title,
        descriptionText: fixture.descriptionText,
        locationRaw: fixture.locationRaw,
      });

      expect(result.india_eligibility).toBe(fixture.expect.india_eligibility);

      if (
        result.india_eligibility === "open" ||
        result.india_eligibility === "india_remote" ||
        result.india_eligibility === "india_onsite" ||
        result.india_eligibility === "region_locked"
      ) {
        expect(result.eligibility_evidence.length).toBeGreaterThan(0);
        const corpus = [
          fixture.title,
          fixture.locationRaw ? `Location: ${fixture.locationRaw}` : "",
          fixture.descriptionText,
        ].join("\n");
        for (const ev of result.eligibility_evidence) {
          expect(corpus).toContain(ev.slice(0, 20));
        }
      }

      if (fixture.expect.contractor_or_eor !== undefined) {
        expect(result.contractor_or_eor).toBe(fixture.expect.contractor_or_eor);
        if (fixture.expect.contractor_or_eor) {
          expect(result.contractor_or_eor_evidence).toBeTruthy();
        }
      }

      if (fixture.expect.seniority) {
        expect(result.seniority).toBe(fixture.expect.seniority);
      }

      if (fixture.expect.role_family) {
        expect(result.role_family).toBe(fixture.expect.role_family);
      }

      if (fixture.expect.interview_style_includes) {
        for (const style of fixture.expect.interview_style_includes) {
          expect(result.interview_style).toContain(style);
          expect(result.interview_style_evidence[style]?.length).toBeGreaterThan(
            0,
          );
        }
      }

      if (fixture.expect.compensation) {
        expect(result.compensation).toMatchObject(fixture.expect.compensation);
      }
    });
  }

  it("never treats bare Remote as open", () => {
    const result = classifyWithRules({
      title: "Engineer",
      descriptionText: "Remote position. Join us.",
      locationRaw: "Remote",
    });
    expect(result.india_eligibility).not.toBe("open");
    expect(result.india_eligibility).toBe("unclear");
  });
});
