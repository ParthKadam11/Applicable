import { afterAll, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "../../src/db/client.js";
import { companies, companyCandidates } from "../../src/db/schema.js";

vi.mock("../../src/discover/probe-ats.js", () => ({
  countOpenJobs: vi.fn(async () => 3),
  detectAtsByGuess: vi.fn(async () => ({
    ats: "greenhouse" as const,
    atsSlug: "promote-test-co",
    url: "https://boards.greenhouse.io/promote-test-co",
    jobCount: 3,
  })),
}));

vi.mock("../../src/discover/board-titles.js", () => ({
  fetchBoardJobTitles: vi.fn(async () => [
    "Software Engineer",
    "Backend Engineer",
    "Frontend Engineer",
  ]),
}));

vi.mock("../../src/ingestion/fetch-company.js", () => ({
  fetchCompanyJobs: vi.fn(async (_db: unknown, companyId: string) => ({
    companyId,
    companyName: "Promote Test Co",
    ok: true,
    jobCount: 0,
    closedCount: 0,
  })),
}));

vi.mock("../../src/discover/company-name.js", async (importOriginal) => {
  const orig = await importOriginal<
    typeof import("../../src/discover/company-name.js")
  >();
  return {
    ...orig,
    resolveCompanyDisplayName: vi.fn(async () => "Promote Test Co"),
  };
});

async function dbUp(): Promise<boolean> {
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}

describe("verifyAndPromote with mocked ATS", () => {
  it("promotes a pending candidate when ATS probe succeeds", async () => {
    if (!(await dbUp())) return;

    const { verifyAndPromote } = await import("../../src/discover/promote.js");
    const slug = `promote-mock-${Date.now()}`;
    const name = `Promote Mock ${Date.now()}`;

    // Ensure slug not already a company
    await db.delete(companies).where(eq(companies.atsSlug, slug));

    const [cand] = await db
      .insert(companyCandidates)
      .values({
        name,
        domain: "promote-test.example",
        source: "promote_test",
        status: "pending",
        ats: "greenhouse",
        atsSlug: slug,
        evidenceUrl: `https://boards.greenhouse.io/${slug}`,
        updatedAt: new Date(),
      })
      .returning();

    expect(cand).toBeTruthy();

    const { countOpenJobs } = await import("../../src/discover/probe-ats.js");
    vi.mocked(countOpenJobs).mockResolvedValue(3);

    const stats = await verifyAndPromote(db, {
      limit: 1,
      concurrency: 1,
      ingest: false,
      candidateIds: [cand!.id],
    });

    expect(stats.attempted).toBe(1);
    expect(stats.promoted + stats.skippedExisting).toBe(1);

    const [updated] = await db
      .select()
      .from(companyCandidates)
      .where(eq(companyCandidates.id, cand!.id));
    expect(updated?.status).toBe("verified");

    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.atsSlug, slug))
      .limit(1);
    expect(company).toBeTruthy();
    expect(company!.ats).toBe("greenhouse");
    expect(company!.name).toBe("Promote Test Co");

    if (company) {
      await db.delete(companies).where(eq(companies.id, company.id));
    }
    await db.delete(companyCandidates).where(eq(companyCandidates.id, cand!.id));
  });
});

afterAll(async () => {
  void pool;
});
