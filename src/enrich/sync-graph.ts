import { eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import {
  companies,
  companyInvestors,
  companyPeople,
  investors,
  people,
} from "../db/schema.js";
import { createGraphClient } from "../graph/driver.js";
import { stableGraphId } from "../graph/ids.js";

const TIMEOUT_MS = 10_000;

function withTimeout<T>(p: Promise<T>, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`${label} timed out`)),
      TIMEOUT_MS,
    );
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/**
 * Push enrichment nodes/edges for one company into Hydra.
 * Soft-fails per step; never throws to caller.
 */
export async function syncCompanyEnrichmentToGraph(
  db: Db,
  companyId: string,
): Promise<{ ok: boolean; steps: string[]; error?: string }> {
  const client = createGraphClient();
  const steps: string[] = [];
  if (!client.enabled) {
    return { ok: false, steps, error: "graph_disabled" };
  }

  const [co] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  if (!co) return { ok: false, steps, error: "company_not_found" };

  const companyNodeId = stableGraphId("company", companyId);
  const run = async (step: string, cypher: string, params: Record<string, unknown>) => {
    await withTimeout(client.run(cypher, params), step);
    steps.push(step);
  };

  try {
    // Update Company props
    await run(
      "company_props",
      `UNWIND $rows AS row MERGE (n {id: row.id}) SET n:Company, n.ext_id = row.ext_id, n.name = row.name, n.slug = row.slug, n.founded_year = row.founded_year, n.team_size = row.team_size, n.website = row.website, n.one_liner = row.one_liner, n.enriched_at = row.enriched_at`,
      {
        rows: [
          {
            id: companyNodeId,
            ext_id: companyId,
            name: co.name,
            slug: co.slug ?? "",
            founded_year: co.foundedYear ?? 0,
            team_size: co.teamSize ?? 0,
            website: co.website,
            one_liner: (co.oneLiner ?? "").slice(0, 300),
            enriched_at: co.enrichedAt?.toISOString() ?? "",
          },
        ],
      },
    );

    if (co.hqCity || co.hqCountry) {
      const locKey = `${co.hqCity ?? ""}|${co.hqCountry ?? ""}`;
      const locId = stableGraphId("location", locKey);
      await run(
        "location",
        `UNWIND $rows AS row MERGE (n {id: row.id}) SET n:Location, n.city = row.city, n.country = row.country`,
        {
          rows: [
            {
              id: locId,
              city: co.hqCity ?? "",
              country: co.hqCountry ?? "",
            },
          ],
        },
      );
      await run(
        "hq_in",
        `UNWIND $rows AS row MATCH (a:Company {id: row.src}), (b:Location {id: row.dst}) CREATE (a)-[:HQ_IN]->(b)`,
        { rows: [{ src: companyNodeId, dst: locId }] },
      );
    }

    if (co.ycBatch) {
      const batchId = stableGraphId("batch", co.ycBatch);
      await run(
        "batch",
        `UNWIND $rows AS row MERGE (n {id: row.id}) SET n:Batch, n.name = row.name`,
        { rows: [{ id: batchId, name: co.ycBatch }] },
      );
      await run(
        "in_batch",
        `UNWIND $rows AS row MATCH (a:Company {id: row.src}), (b:Batch {id: row.dst}) CREATE (a)-[:IN_BATCH]->(b)`,
        { rows: [{ src: companyNodeId, dst: batchId }] },
      );
    }

    const cps = await db
      .select({
        personId: companyPeople.personId,
        role: companyPeople.role,
        title: companyPeople.title,
        sourceUrl: companyPeople.sourceUrl,
        quote: companyPeople.quote,
        name: people.name,
      })
      .from(companyPeople)
      .innerJoin(people, eq(people.id, companyPeople.personId))
      .where(eq(companyPeople.companyId, companyId));

    for (const cp of cps) {
      const personNodeId = stableGraphId("person", cp.personId);
      await run(
        "person",
        `UNWIND $rows AS row MERGE (n {id: row.id}) SET n:Person, n.name = row.name, n.ext_id = row.ext_id`,
        {
          rows: [
            { id: personNodeId, name: cp.name, ext_id: cp.personId },
          ],
        },
      );
      const rel = cp.role === "works_at" ? "WORKS_AT" : "FOUNDED";
      await run(
        rel.toLowerCase(),
        `UNWIND $rows AS row MATCH (a:Person {id: row.src}), (b:Company {id: row.dst}) CREATE (a)-[:${rel}]->(b)`,
        { rows: [{ src: personNodeId, dst: companyNodeId }] },
      );
    }

    const cis = await db
      .select({
        investorId: companyInvestors.investorId,
        round: companyInvestors.round,
        name: investors.name,
      })
      .from(companyInvestors)
      .innerJoin(investors, eq(investors.id, companyInvestors.investorId))
      .where(eq(companyInvestors.companyId, companyId));

    for (const ci of cis) {
      const invNodeId = stableGraphId("investor", ci.investorId);
      await run(
        "investor",
        `UNWIND $rows AS row MERGE (n {id: row.id}) SET n:Investor, n.name = row.name, n.ext_id = row.ext_id`,
        {
          rows: [
            { id: invNodeId, name: ci.name, ext_id: ci.investorId },
          ],
        },
      );
      await run(
        "invested_in",
        `UNWIND $rows AS row MATCH (a:Investor {id: row.src}), (b:Company {id: row.dst}) CREATE (a)-[:INVESTED_IN]->(b)`,
        { rows: [{ src: invNodeId, dst: companyNodeId }] },
      );
    }

    // Also write Person linkedin when present on people row
    return { ok: true, steps };
  } catch (err) {
    return {
      ok: false,
      steps,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
