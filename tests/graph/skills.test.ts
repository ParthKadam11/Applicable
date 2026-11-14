import { describe, expect, it } from "vitest";
import {
  extractSkills,
  normalizeSkill,
} from "../../src/graph/skills.js";

describe("skill extraction", () => {
  it("extracts canonical skills from title+description", () => {
    const skills = extractSkills(
      "Senior Backend Engineer (TypeScript, Golang)",
      "We use PostgreSQL, Kubernetes (k8s), and React. Experience with AWS S3 and REST APIs.",
    );
    expect(skills).toContain("typescript");
    expect(skills).toContain("golang");
    expect(skills).toContain("postgres");
    expect(skills).toContain("kubernetes");
    expect(skills).toContain("react");
    expect(skills).toContain("s3");
    expect(skills).toContain("aws");
    expect(skills).toContain("rest");
  });

  it("normalizes aliases", () => {
    expect(normalizeSkill("PostgreSQL")).toBe("postgres");
    expect(normalizeSkill("k8s")).toBe("kubernetes");
    expect(normalizeSkill("node.js")).toBe("nodejs");
    expect(normalizeSkill("rest api")).toBe("rest");
    expect(normalizeSkill("not-a-real-skill-xyz")).toBeNull();
  });

  it("does not false-positive short tokens inside words", () => {
    const skills = extractSkills("Catalyst", "Our catalytic converter team");
    expect(skills).not.toContain("c");
  });

  it("rejects ambiguous bare words without context", () => {
    const skills = extractSkills(
      "Product Manager",
      "Please go rest. We express interest in the next spring cohort. Act swift.",
    );
    expect(skills).not.toContain("rest");
    expect(skills).not.toContain("golang");
    expect(skills).not.toContain("express");
    expect(skills).not.toContain("spring");
    expect(skills).not.toContain("nextjs");
    expect(skills).not.toContain("swift");
  });

  it("matches qualified ambiguous skills", () => {
    const skills = extractSkills(
      "Engineer",
      "Stack: Express.js, Next.js, Spring Boot, Golang, Swift programming, REST API.",
    );
    expect(skills).toContain("express");
    expect(skills).toContain("nextjs");
    expect(skills).toContain("springboot");
    expect(skills).toContain("golang");
    expect(skills).toContain("swift");
    expect(skills).toContain("rest");
  });

  it("normalizeSkill rejects bare ambiguous tokens", () => {
    expect(normalizeSkill("go")).toBeNull();
    expect(normalizeSkill("rest")).toBeNull();
    expect(normalizeSkill("spring")).toBeNull();
    expect(normalizeSkill("express")).toBeNull();
    expect(normalizeSkill("swift")).toBeNull();
    expect(normalizeSkill("golang")).toBe("golang");
  });
});
