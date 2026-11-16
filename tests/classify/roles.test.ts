import { describe, expect, it } from "vitest";
import {
  classifyRoleFamily,
  isStaffingNoise,
  isTechRole,
} from "../../src/classify/roles.js";

describe("classifyRoleFamily", () => {
  it("keeps engineering families", () => {
    expect(classifyRoleFamily("Senior Backend Engineer").role_family).toBe(
      "backend",
    );
    expect(classifyRoleFamily("Frontend Developer").role_family).toBe(
      "frontend",
    );
    expect(classifyRoleFamily("iOS Engineer").role_family).toBe("mobile");
    expect(classifyRoleFamily("Staff Platform Engineer").role_family).toBe(
      "infra",
    );
    expect(classifyRoleFamily("Machine Learning Engineer").role_family).toBe(
      "ml",
    );
    expect(classifyRoleFamily("Data Engineer").role_family).toBe("data");
    expect(classifyRoleFamily("Security Engineer").role_family).toBe("security");
    expect(classifyRoleFamily("QA Engineer").role_family).toBe("qa");
    expect(classifyRoleFamily("Developer Advocate").role_family).toBe(
      "developer_relations",
    );
    expect(classifyRoleFamily("Solutions Engineer").role_family).toBe(
      "solutions",
    );
    expect(classifyRoleFamily("Software Engineer").role_family).toBe("other");
  });

  it("marks non-tech roles", () => {
    expect(classifyRoleFamily("Account Executive").role_family).toBe("non_tech");
    expect(classifyRoleFamily("Marketing Manager").role_family).toBe("non_tech");
    expect(classifyRoleFamily("Recruiter").role_family).toBe("non_tech");
    expect(classifyRoleFamily("Customer Success Manager").role_family).toBe(
      "non_tech",
    );
    expect(classifyRoleFamily("Product Designer").role_family).toBe("non_tech");
    expect(classifyRoleFamily("General Counsel").role_family).toBe("non_tech");
    expect(classifyRoleFamily("Product Manager - Auth").role_family).toBe(
      "non_tech",
    );
    expect(
      classifyRoleFamily("Medical Biller, Specialty DME").role_family,
    ).toBe("non_tech");
  });

  it("does not promote Product Manager via description infrastructure cues", () => {
    expect(
      classifyRoleFamily(
        "Product Manager - Platform",
        "You will own our infrastructure and platform engineer roadmap.",
      ).role_family,
    ).toBe("non_tech");
  });

  it("keeps sales engineer as tech solutions", () => {
    expect(classifyRoleFamily("Sales Engineer").role_family).toBe("solutions");
  });

  it("flags AI-trainer / dialect / labeling as non_tech", () => {
    expect(
      classifyRoleFamily(
        "Bhojpuri Dialect Specialist - Freelance AI Trainer Project",
        "",
        "Meridial",
      ).role_family,
    ).toBe("non_tech");
    expect(
      classifyRoleFamily("AI Trainer", "", "Acme").role_family,
    ).toBe("non_tech");
    expect(
      classifyRoleFamily("Data Labeling Specialist", "", "Outlier").role_family,
    ).toBe("non_tech");
    expect(
      classifyRoleFamily("Language Expert - AI Rater", "", "Appen").role_family,
    ).toBe("non_tech");
  });

  it("does not flag real SWE/ML engineers at labeling agencies", () => {
    expect(
      classifyRoleFamily("Software Engineer", "", "Scale AI").role_family,
    ).toBe("other");
    expect(
      classifyRoleFamily("Machine Learning Engineer", "", "Scale AI")
        .role_family,
    ).toBe("ml");
  });
});

describe("isStaffingNoise", () => {
  it("matches title + agency patterns", () => {
    expect(
      isStaffingNoise(
        "Haryanvi Dialect Specialist - Freelance AI Trainer Project",
        "Meridial",
      ),
    ).toBe(true);
    expect(isStaffingNoise("Software Engineer Intern (2027)", "Cloudflare")).toBe(
      false,
    );
  });
});

describe("isTechRole", () => {
  it("excludes non_tech only", () => {
    expect(isTechRole("backend")).toBe(true);
    expect(isTechRole("other")).toBe(true);
    expect(isTechRole("non_tech")).toBe(false);
    expect(isTechRole(null)).toBe(true);
  });
});
