import { describe, expect, it } from "vitest";
import { skillGap } from "../../src/graph/skill-gap.js";
import { mockGraphClient } from "../../src/graph/driver.js";
import type { Db } from "../../src/db/client.js";

describe("skill_gap", () => {
  it("errors without skills or me token", async () => {
    const r = await skillGap(
      {} as Db,
      { me: true },
      { userId: null, client: mockGraphClient(async () => ({ keys: [], records: [] })) },
    );
    expect(r.source).toBe("error");
    expect(r.error).toMatch(/personal MCP bearer token/i);
  });

  it("ranks one-skill unlocks on fixture rows", async () => {
    const rows = [
      {
        id: "11111111-1111-1111-1111-111111111111",
        title: "Backend Engineer Postgres TypeScript",
        company: "A",
        descriptionText: "Need postgres and typescript and kubernetes experience",
      },
      {
        id: "22222222-2222-2222-2222-222222222222",
        title: "Platform Engineer",
        company: "B",
        descriptionText: "postgres typescript kubernetes docker",
      },
      {
        id: "33333333-3333-3333-3333-333333333333",
        title: "Data Engineer",
        company: "C",
        descriptionText: "Only spark and airflow here",
      },
    ];

    // Drizzle-like chain for the openJobs select
    const db = {
      select: () => ({
        from: () => ({
          innerJoin: () => ({
            innerJoin: () => ({
              where: async () => rows,
            }),
          }),
        }),
      }),
    } as unknown as Db;

    const r = await skillGap(
      db,
      { my_skills: ["postgres", "typescript"], max_skills: 5 },
      { client: mockGraphClient(async () => ({ keys: [], records: [] }), false) },
    );
    expect(r.source).toBe("postgres");
    expect(r.gaps.length).toBeGreaterThan(0);
    // kubernetes is the common single missing skill for first two jobs
    const top = r.gaps[0]!;
    expect(top.skill).toBe("kubernetes");
    expect(top.unlocks).toBeGreaterThanOrEqual(1);
    expect(top.examples.length).toBeGreaterThanOrEqual(1);
  });
});
