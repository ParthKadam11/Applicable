import { describe, expect, it } from "vitest";
import {
  classifyIndiaEligibility,
  classifyLocationRaw,
  isApplyContextSentence,
  isNegativeEligibilitySentence,
} from "../../src/classify/eligibility.js";

describe("eligibility negative phrases", () => {
  it("flags company/customer/team worldwide marketing", () => {
    expect(isNegativeEligibilitySentence("We are a worldwide team.")).toBe(true);
    expect(
      isNegativeEligibilitySentence("Our customers are in 100+ countries."),
    ).toBe(true);
    expect(isNegativeEligibilitySentence("We're distributed across the globe.")).toBe(
      true,
    );
  });

  it("does not flag real applicant eligibility sentences", () => {
    expect(
      isNegativeEligibilitySentence(
        "Candidates in India are welcome to apply.",
      ),
    ).toBe(false);
    expect(isApplyContextSentence("Candidates in India are welcome to apply.")).toBe(
      true,
    );
  });
});

describe("classifyLocationRaw", () => {
  it("locks non-India geos", () => {
    expect(classifyLocationRaw("Remote - USA")?.india_eligibility).toBe(
      "region_locked",
    );
    expect(classifyLocationRaw("EMEA")?.india_eligibility).toBe("region_locked");
    expect(classifyLocationRaw("London")?.eligibility_evidence).toEqual(["London"]);
  });

  it("opens Anywhere/Worldwide; APAC without India is unclear", () => {
    expect(classifyLocationRaw("Anywhere")?.india_eligibility).toBe("open");
    expect(classifyLocationRaw("Worldwide")?.india_eligibility).toBe("open");
    expect(classifyLocationRaw("Global")?.india_eligibility).toBe("open");
    expect(classifyLocationRaw("Remote, APAC")?.india_eligibility).toBe("unclear");
    expect(classifyLocationRaw("APAC")?.india_eligibility).toBe("unclear");
    expect(classifyLocationRaw("EMEA")?.india_eligibility).toBe("region_locked");
  });

  it("splits India remote vs onsite", () => {
    expect(classifyLocationRaw("Remote - India")?.india_eligibility).toBe(
      "india_remote",
    );
    expect(classifyLocationRaw("Bengaluru, India")?.india_eligibility).toBe(
      "india_onsite",
    );
  });

  it("ignores bare Remote", () => {
    expect(classifyLocationRaw("Remote")).toBeNull();
  });
});

describe("classifyIndiaEligibility", () => {
  it("stays unclear for worldwide team marketing", () => {
    const r = classifyIndiaEligibility({
      title: "Eng",
      locationRaw: "Remote",
      descriptionText: "We are a worldwide team. Great benefits.",
    });
    expect(r.india_eligibility).toBe("unclear");
  });

  it("uses location_raw before description", () => {
    const r = classifyIndiaEligibility({
      title: "Eng",
      locationRaw: "Remote - USA",
      descriptionText: "Work from anywhere. Worldwide remote role.",
    });
    expect(r.india_eligibility).toBe("region_locked");
    expect(r.eligibility_evidence).toEqual(["Remote - USA"]);
  });

  it("locks title country codes like (US)", () => {
    const r = classifyIndiaEligibility({
      title: "Backend Engineer (UK)",
      locationRaw: "Remote",
      descriptionText: "Great remote role.",
    });
    expect(r.india_eligibility).toBe("region_locked");
  });

  it("opens contractor/EOR paths", () => {
    const r = classifyIndiaEligibility({
      title: "Eng",
      descriptionText: "Hired through Deel as a contractor.",
    });
    expect(r.india_eligibility).toBe("open");
  });

  it("does not treat Remote, APAC as open", () => {
    const r = classifyIndiaEligibility({
      title: "Eng",
      locationRaw: "Remote, APAC",
      descriptionText: "Hiring across APAC for our team.",
    });
    expect(r.india_eligibility).toBe("unclear");
  });
});
