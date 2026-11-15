import { describe, expect, it } from "vitest";
import {
  classifySeniority,
  isEarlyCareer,
} from "../../src/classify/seniority.js";

describe("classifySeniority", () => {
  it("prefers title intern over JD years", () => {
    const r = classifySeniority(
      "Software Engineering Intern",
      "Requires 5+ years of experience building distributed systems.",
    );
    expect(r.seniority).toBe("intern");
  });

  it("maps junior / new grad / SDE I / associate to entry", () => {
    expect(classifySeniority("Junior Backend Engineer").seniority).toBe("entry");
    expect(classifySeniority("New Grad Software Engineer").seniority).toBe(
      "entry",
    );
    expect(classifySeniority("SDE I").seniority).toBe("entry");
    expect(classifySeniority("Associate Engineer").seniority).toBe("entry");
    expect(classifySeniority("Fresher Developer").seniority).toBe("entry");
  });

  it("maps staff / principal to staff and senior/lead to senior", () => {
    expect(classifySeniority("Staff Engineer").seniority).toBe("staff");
    expect(classifySeniority("Principal Engineer").seniority).toBe("staff");
    expect(classifySeniority("Senior Software Engineer").seniority).toBe(
      "senior",
    );
    expect(classifySeniority("Engineering Lead").seniority).toBe("senior");
  });

  it("uses YoE regex when title has no signal", () => {
    expect(
      classifySeniority(
        "Software Engineer",
        "Looking for candidates with 0-2 years of experience.",
      ),
    ).toMatchObject({ seniority: "entry", yearsMin: 0, yearsMax: 2 });
    expect(
      classifySeniority(
        "Software Engineer",
        "3-5 years of experience required.",
      ).seniority,
    ).toBe("mid");
    expect(
      classifySeniority(
        "Software Engineer",
        "1+ years of industry experience.",
      ).seniority,
    ).toBe("entry");
  });

  it("stores evidence quote", () => {
    const r = classifySeniority("Backend Engineer", "Must have 0-2 years.");
    expect(r.evidence).toMatch(/0-2 years/i);
  });
});

describe("isEarlyCareer", () => {
  it("includes intern, entry, and mid with max<=2", () => {
    expect(isEarlyCareer({ seniority: "intern" })).toBe(true);
    expect(isEarlyCareer({ seniority: "entry" })).toBe(true);
    expect(isEarlyCareer({ seniority: "junior" })).toBe(true);
    expect(isEarlyCareer({ seniority: "mid", yearsMax: 2 })).toBe(true);
    expect(isEarlyCareer({ seniority: "mid", yearsMax: 5 })).toBe(false);
    expect(isEarlyCareer({ seniority: "senior" })).toBe(false);
  });
});
