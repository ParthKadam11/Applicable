import { describe, expect, it } from "vitest";
import { normalizeSmartRecruitersJob } from "../../src/ats/smartrecruiters.js";

describe("normalizeSmartRecruitersJob", () => {
  it("maps list + detail into NormalizedJob", () => {
    const job = normalizeSmartRecruitersJob(
      {
        id: "6001",
        name: "Software Engineer",
        location: {
          city: "Bengaluru",
          country: "in",
          remote: false,
          fullLocation: "Bengaluru, KA, India",
        },
        releasedDate: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "6001",
        name: "Software Engineer",
        location: {
          city: "Bengaluru",
          country: "in",
          fullLocation: "Bengaluru, KA, India",
        },
        applyUrl: "https://jobs.smartrecruiters.com/swiggy/6001",
        jobAd: {
          sections: {
            jobDescription: {
              text: "<p>Build APIs. 0-2 years experience.</p>",
            },
          },
        },
      },
      "11111111-1111-1111-1111-111111111111",
      "swiggy",
    );

    expect(job.sourceAts).toBe("smartrecruiters");
    expect(job.externalId).toBe("6001");
    expect(job.title).toBe("Software Engineer");
    expect(job.locationRaw).toBe("Bengaluru, KA, India");
    expect(job.descriptionText).toMatch(/Build APIs/);
    expect(job.applyUrl).toContain("smartrecruiters");
  });
});
