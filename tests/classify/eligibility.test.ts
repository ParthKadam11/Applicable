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

  it("opens Anywhere/Worldwide/Global Remote; APAC/EMEA lock with named region", () => {
    expect(classifyLocationRaw("Anywhere")?.india_eligibility).toBe("open");
    expect(classifyLocationRaw("Worldwide")?.india_eligibility).toBe("open");
    expect(classifyLocationRaw("Global")?.india_eligibility).toBe("open");
    expect(classifyLocationRaw("Global Remote")?.india_eligibility).toBe("open");
    expect(classifyLocationRaw("Remote, APAC")?.india_eligibility).toBe("region_locked");
    expect(classifyLocationRaw("Remote, APAC")?.remote_scope).toBe("APAC");
    expect(classifyLocationRaw("APAC")?.india_eligibility).toBe("region_locked");
    expect(classifyLocationRaw("EMEA")?.india_eligibility).toBe("region_locked");
    expect(classifyLocationRaw("Remote - EMEA")?.remote_scope).toBe("EMEA");
  });

  it("splits India remote vs onsite", () => {
    expect(classifyLocationRaw("Remote - India")?.india_eligibility).toBe(
      "india_remote",
    );
    expect(classifyLocationRaw("Bengaluru, India")?.india_eligibility).toBe(
      "india_onsite",
    );
  });

  
  it("locks Espoo/Bellevue/Lausanne/NYC/Kosovo location_raw", () => {
    for (const loc of [
      "Espoo",
      "Bellevue, WA",
      "Lausanne",
      "NYC Office",
      "Kosovo",
      "Honduras",
      "NY, SF or Remote",
    ]) {
      expect(
        classifyLocationRaw(loc)?.india_eligibility,
        loc,
      ).toBe("region_locked");
    }
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

  it("specific location stays locked for perk work-from-anywhere; strong hire overrides", () => {
    const locked = classifyIndiaEligibility({
      title: "Eng",
      locationRaw: "Remote - USA",
      descriptionText: "Great benefits. Worldwide customers.",
    });
    expect(locked.india_eligibility).toBe("region_locked");

    const perk = classifyIndiaEligibility({
      title: "Eng",
      locationRaw: "Remote - USA",
      descriptionText: "Work from anywhere. Worldwide remote role.",
    });
    expect(perk.india_eligibility).toBe("region_locked");

    const overridden = classifyIndiaEligibility({
      title: "Eng",
      locationRaw: "Remote - USA",
      descriptionText: "We hire in any country for this role.",
    });
    expect(overridden.india_eligibility).toBe("open");
  });

  it("Notabene Remote - EMEA + Flexible Remote Work perk → region_locked", () => {
    const r = classifyIndiaEligibility({
      title: "Engineer",
      locationRaw: "Remote - EMEA",
      descriptionText:
        "Benefits\n- Flexible Remote Work: Work from anywhere!\n- Health insurance",
    });
    expect(r.india_eligibility).toBe("region_locked");
    expect(r.eligibility_evidence[0]).toMatch(/EMEA/i);
    expect(r.remote_scope).toBe("EMEA");
  });

  it("Duffel London + Work from anywhere policy → region_locked", () => {
    const r = classifyIndiaEligibility({
      title: "Engineer",
      locationRaw: "London",
      descriptionText: "🏝️ Work from anywhere policy\nGreat team.",
    });
    expect(r.india_eligibility).toBe("region_locked");
    expect(r.eligibility_evidence[0]).toMatch(/London/i);
  });

  it("Location Remote (anywhere) + we hire in any country → open", () => {
    const r = classifyIndiaEligibility({
      title: "Engineer",
      locationRaw: "Remote (anywhere)",
      descriptionText: "Location: Remote (anywhere). We hire in any country.",
    });
    expect(r.india_eligibility).toBe("open");
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

  it("Remote, APAC is region_locked (not open)", () => {
    const r = classifyIndiaEligibility({
      title: "Eng",
      locationRaw: "Remote, APAC",
      descriptionText: "Hiring across APAC for our team.",
    });
    expect(r.india_eligibility).toBe("region_locked");
    expect(r.remote_scope).toBe("APAC");
  });

  it("Sequoia India funding blurb is not india_remote", () => {
    const r = classifyIndiaEligibility({
      title: "Senior Software Engineer, Product",
      locationRaw: "SF Bay Area",
      descriptionText:
        "We've raised $60M in funding, including our recent Series B led by Peak XV Partners (formerly Sequoia India), with participation from healthcare-focused Define Ventures and continued support from General Catalyst and Y Combinator. Build great product.",
    });
    expect(r.india_eligibility).not.toBe("india_remote");
    expect(r.india_eligibility).not.toBe("india_onsite");
    expect(r.eligibility_evidence.join(" ")).not.toMatch(/Sequoia India/i);
  });

  it("travel stipend anywhere is not open", () => {
    const r = classifyIndiaEligibility({
      title: "Full Stack Engineer",
      locationRaw: "NY, SF or Remote",
      descriptionText:
        "About the role\nBuild cool stuff.\n\nBenefits\n- $4000/yr Travel Stipend to travel anywhere anytime to work alongside other Roboflowers\n- Health insurance",
    });
    expect(r.india_eligibility).not.toBe("open");
    expect(r.eligibility_evidence.join(" ")).not.toMatch(/Travel Stipend/i);
  });

  it("Remote - India location still india_remote", () => {
    const r = classifyIndiaEligibility({
      title: "Data Engineer",
      locationRaw: "Remote - India",
      descriptionText: "Join our team.",
    });
    expect(r.india_eligibility).toBe("india_remote");
    expect(r.eligibility_evidence[0]).toMatch(/India/i);
  });

  it("ARG/UY based only title → region_locked", () => {
    const r = classifyIndiaEligibility({
      title: "Senior Fullstack Engineer (ARG/UY based only)",
      locationRaw: "Argentina/Uruguay (Remote)",
      descriptionText: "Build product.",
    });
    expect(r.india_eligibility).toBe("region_locked");
    expect(r.eligibility_evidence[0]).toMatch(/ARG\/UY|Argentina/i);
  });

  it("BR based only + São Paulo → region_locked", () => {
    const r = classifyIndiaEligibility({
      title: "Senior Fullstack Engineer (BR based only)",
      locationRaw: "São Paulo/Belo Horizonte (Remote)",
      descriptionText: "Build product.",
    });
    expect(r.india_eligibility).toBe("region_locked");
  });

  it("Bogota / Based in Colombia → region_locked not open", () => {
    const r = classifyIndiaEligibility({
      title: "Information Security Engineer | GRC",
      locationRaw: "Bogota",
      descriptionText:
        "Based in Colombia, you'll work directly with our group CISO. As a contractor you'll supply a secure computer.",
    });
    expect(r.india_eligibility).toBe("region_locked");
    expect(r.eligibility_evidence.join(" ")).not.toMatch(/secure computer/i);
  });

  it("India location + (Remote) title + isRemoteFlag → india_remote", () => {
    const r = classifyIndiaEligibility({
      title: "Software Engineer (Remote)",
      locationRaw: "India",
      descriptionText: "Join us.",
      isRemoteFlag: true,
    });
    expect(r.india_eligibility).toBe("india_remote");
  });

  it("World Wide - Remote uses location as open evidence not gear", () => {
    const r = classifyIndiaEligibility({
      title: "Language Specialist",
      locationRaw: "World Wide - Remote",
      descriptionText:
        "As a contractor you'll supply a secure computer and high-speed internet; company-sponsored benefits.",
    });
    expect(r.india_eligibility).toBe("open");
    expect(r.eligibility_evidence[0]).toMatch(/World Wide/i);
    expect(r.eligibility_evidence.join(" ")).not.toMatch(/secure computer/i);
  });

  it("Krakow location → region_locked", () => {
    const r = classifyIndiaEligibility({
      title: "Lead Software Engineer (Java)",
      locationRaw: "Krakow",
      descriptionText: "Join the team.",
      isRemoteFlag: true,
    });
    expect(r.india_eligibility).toBe("region_locked");
  });
});
