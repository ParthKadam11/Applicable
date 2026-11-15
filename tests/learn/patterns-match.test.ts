import { describe, expect, it } from "vitest";
import { matchPatterns } from "../../src/learn/patterns.js";

describe("matchPatterns", () => {
  it("picks highest-weight matching phrase", () => {
    const hit = matchPatterns(
      "Location: Remote - India. We hire from India.",
      [
        {
          phrase: "Remote - India",
          label: "india_remote",
          weight: 2,
          hit_count: 2,
          company_count: 2,
          status: "active",
        },
        {
          phrase: "hire from India",
          label: "india_remote",
          weight: 5,
          hit_count: 5,
          company_count: 3,
          status: "active",
        },
      ],
    );
    expect(hit?.phrase).toBe("hire from India");
    expect(hit?.weight).toBe(5);
  });

  it("returns null when nothing matches", () => {
    expect(
      matchPatterns("A great culture and benefits package.", [
        {
          phrase: "US work authorization required",
          label: "region_locked",
          weight: 3,
          hit_count: 3,
          company_count: 2,
          status: "active",
        },
      ]),
    ).toBeNull();
  });

  it("ignores candidate patterns (<2 companies)", () => {
    expect(
      matchPatterns("Hiring in Colombia for this role.", [
        {
          phrase: "Colombia",
          label: "region_locked",
          weight: 1,
          hit_count: 1,
          company_count: 1,
          status: "candidate",
        },
      ]),
    ).toBeNull();
  });
});
