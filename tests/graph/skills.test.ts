import { describe, expect, it } from "vitest";
import { extractSkills, normalizeSkill } from "../../src/graph/skills.js";

describe("skill extraction", () => {
  it("extracts canonical skills from title+description", () => {
    const skills = extractSkills(
      "Senior Backend Engineer (TypeScript, Go)",
      "We use PostgreSQL, Kubernetes (k8s), and React. Experience with AWS S3.",
    );
    expect(skills).toContain("typescript");
    expect(skills).toContain("golang");
    expect(skills).toContain("postgres");
    expect(skills).toContain("kubernetes");
    expect(skills).toContain("react");
    expect(skills).toContain("s3");
    expect(skills).toContain("aws");
  });

  it("normalizes aliases", () => {
    expect(normalizeSkill("PostgreSQL")).toBe("postgres");
    expect(normalizeSkill("k8s")).toBe("kubernetes");
    expect(normalizeSkill("node.js")).toBe("nodejs");
    expect(normalizeSkill("not-a-real-skill-xyz")).toBeNull();
  });

  it("does not false-positive short tokens inside words", () => {
    const skills = extractSkills("Catalyst", "Our catalytic converter team");
    expect(skills).not.toContain("c");
  });
});
