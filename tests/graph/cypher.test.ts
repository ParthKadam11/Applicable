import { describe, expect, it } from "vitest";
import {
  assertParameterized,
  companyJobsBySkillQuery,
  matchSkillsQueryV2,
  similarCompaniesQuery,
  upsertNodesByLabel,
} from "../../src/graph/cypher.js";

describe("cypher builders", () => {
  it("match_skills is parameterized (no user string interpolation)", () => {
    const evil = "DROP GRAPH; MATCH (n) RETURN n";
    const q = matchSkillsQueryV2({
      skills: [evil, "postgres"],
      labels: ["open", "india_remote"],
    });
    assertParameterized(q, [evil]);
    expect(q.cypher).toContain("$s0");
    expect(q.cypher).toContain("$l0");
    expect(q.cypher).not.toMatch(/\bUNWIND\b/);
    expect(q.cypher).not.toMatch(/DISTINCT/i);
    expect(q.params.s0).toBe(evil);
    expect(q.params.s1).toBe("postgres");
  });

  it("similar_companies reads SIMILAR_TO without jobs cartesian", () => {
    const slug = "acme-MATCH-DETACH-DELETE";
    const q = similarCompaniesQuery({ companySlug: slug });
    assertParameterized(q, [slug]);
    expect(q.cypher).toContain("SIMILAR_TO");
    expect(q.cypher).toContain("USES_SKILL");
    expect(q.cypher).not.toMatch(/:POSTS/);
    expect(q.cypher).not.toMatch(/DISTINCT/i);
    expect(q.params.slug).toBe(slug);
  });

  it("company_jobs_by_skill parameterizes skill", () => {
    const skill = "rust-RETURN-1";
    const q = companyJobsBySkillQuery({
      skill,
      labels: ["open"],
    });
    assertParameterized(q, [skill]);
    expect(q.cypher).not.toMatch(/\bUNWIND\b/);
    expect(q.cypher).not.toMatch(/DISTINCT/i);
    expect(q.params.skill).toBe(skill);
    expect(q.params.l0).toBe("open");
  });

  it("upsert nodes uses UNWIND $rows MERGE SET label", () => {
    const q = upsertNodesByLabel("Skill", [{ id: 1, name: "postgres" }]);
    expect(q.cypher).toMatch(/UNWIND \$rows/);
    expect(q.cypher).toMatch(/MERGE \(n \{id: row\.id\}\)/);
    expect(q.cypher).toContain("SET n:Skill");
  });
});
