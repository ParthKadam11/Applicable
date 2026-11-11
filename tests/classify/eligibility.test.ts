import { describe, expect, it } from "vitest";
import {
  classifyIndiaEligibility,
  classifyLocationRaw,
  isApplyContextSentence,
  isHiringLocationContext,
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
    expect(
      isNegativeEligibilitySentence(
        "Grafana Alerting is trusted by major organizations worldwide, monitoring essential medical devices.",
      ),
    ).toBe(true);
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
    expect(
      isHiringLocationContext("This role is remote worldwide."),
    ).toBe(true);
  });
});

describe("classifyLocationRaw", () => {
  it("locks non-India geos including cities", () => {
    expect(classifyLocationRaw("Remote - USA")?.india_eligibility).toBe(
      "region_locked",
    );
    expect(classifyLocationRaw("EMEA")?.india_eligibility).toBe("region_locked");
    expect(classifyLocationRaw("London")?.eligibility_evidence).toEqual(["London"]);
    expect(classifyLocationRaw("Paris")?.india_eligibility).toBe("region_locked");
    expect(classifyLocationRaw("Germany (Remote)")?.india_eligibility).toBe(
      "region_locked",
    );
  });

  it("opens Anywhere/Worldwide/Global Remote; APAC without India is unclear", () => {
    expect(classifyLocationRaw("Anywhere")?.india_eligibility).toBe("open");
    expect(classifyLocationRaw("Worldwide")?.india_eligibility).toBe("open");
    expect(classifyLocationRaw("Global")?.india_eligibility).toBe("open");
    expect(classifyLocationRaw("Global Remote")?.india_eligibility).toBe("open");
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

  it("Grafana Germany location is region_locked, not marketing open", () => {
    const r = classifyIndiaEligibility({
      title: "Staff Backend Engineer - Grafana Alerting | Germany | Remote",
      locationRaw: "Germany (Remote)",
      descriptionText:
        "<p>Grafana Alerting is trusted by major organizations worldwide, monitoring essential medical devices and critical infrastructure.</p>",
    });
    expect(r.india_eligibility).not.toBe("open");
    expect(r.india_eligibility).toBe("region_locked");
    expect(r.eligibility_evidence[0]).toMatch(/Germany/i);
  });

  it("Riot Paris location is region_locked, not around-the-world marketing", () => {
    const r = classifyIndiaEligibility({
      title: "Backend Engineer",
      locationRaw: "Paris",
      descriptionText:
        "We have offices around the world. Join our engineering team in Paris.",
    });
    expect(r.india_eligibility).not.toBe("open");
    expect(r.india_eligibility).toBe("region_locked");
    expect(r.eligibility_evidence[0]).toMatch(/Paris/i);
  });

  it("Metabase Global Remote location is open", () => {
    const r = classifyIndiaEligibility({
      title: "Backend Engineer",
      locationRaw: "Global Remote",
      descriptionText: "Build the product customers love.",
    });
    expect(r.india_eligibility).toBe("open");
    expect(r.eligibility_evidence).toEqual(["Global Remote"]);
  });

  it("customers worldwide + Berlin location → region_locked", () => {
    const r = classifyIndiaEligibility({
      title: "Engineer",
      locationRaw: "Berlin",
      descriptionText: "We serve customers worldwide. Location: Berlin",
    });
    expect(r.india_eligibility).toBe("region_locked");
    expect(r.eligibility_evidence[0]).toMatch(/Berlin/i);
  });

  it("Remote - work from anywhere → open", () => {
    const r = classifyIndiaEligibility({
      title: "Engineer",
      locationRaw: "Remote",
      descriptionText: "Remote - work from anywhere",
    });
    expect(r.india_eligibility).toBe("open");
    expect(r.eligibility_evidence.some((e) => /work from anywhere/i.test(e))).toBe(
      true,
    );
  });

  it("based anywhere in the USA is region_locked, not open", () => {
    const r = classifyIndiaEligibility({
      title: "Care Specialist",
      locationRaw: "Remote",
      descriptionText: "This is a remote role based anywhere in the USA.",
    });
    expect(r.india_eligibility).not.toBe("open");
    expect(r.india_eligibility).toBe("region_locked");
  });

  it("specific location stays locked unless body has explicit open hire phrase", () => {
    const locked = classifyIndiaEligibility({
      title: "Eng",
      locationRaw: "Remote - USA",
      descriptionText: "Great benefits. Worldwide customers.",
    });
    expect(locked.india_eligibility).toBe("region_locked");

    const overridden = classifyIndiaEligibility({
      title: "Eng",
      locationRaw: "Remote - USA",
      descriptionText: "Work from anywhere. Worldwide remote role.",
    });
    expect(overridden.india_eligibility).toBe("open");
    expect(overridden.eligibility_evidence[0]).toMatch(/work from anywhere/i);
  });

  it("locks title country codes like (UK)", () => {
    const r = classifyIndiaEligibility({
      title: "Backend Engineer (UK)",
      locationRaw: "Remote",
      descriptionText: "Great remote role.",
    });
    expect(r.india_eligibility).toBe("region_locked");
  });

  it("locks title pipe geos like | Germany |", () => {
    const r = classifyIndiaEligibility({
      title: "Staff Backend Engineer | Germany | Remote",
      locationRaw: "Remote",
      descriptionText: "Trusted by organizations worldwide.",
    });
    expect(r.india_eligibility).toBe("region_locked");
  });

  it("opens contractor/EOR paths when no specific geo", () => {
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
