import { createGraphClient } from "../graph/driver.js";
import { stableGraphId } from "../graph/ids.js";
import {
  GRAPH_EDGE_TYPES,
  GRAPH_NODE_LABELS,
  upsertNodesByLabel,
} from "../graph/cypher.js";

const HYDRA_TIMEOUT_MS = 8_000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms,
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

/** Extend local unions without breaking existing typed helpers. */
export function learningNodeLabels() {
  return [...GRAPH_NODE_LABELS, "Correction", "Pattern"] as const;
}

export function learningEdgeTypes() {
  return [
    ...GRAPH_EDGE_TYPES,
    "CORRECTED_BY",
    "ABOUT_COMPANY",
    "USES_PATTERN",
  ] as const;
}

export type PushCorrectionArgs = {
  correctionId: string;
  jobId: string;
  companyId: string;
  companyName: string;
  oldLabel: string | null;
  newLabel: string;
  evidence: string;
  source: string;
  patternPhrase: string | null;
  patternLabel: string | null;
  patternWeight: number | null;
};

/**
 * Write Correction (+ optional Pattern) nodes and link to Job / Company.
 * Never throws to callers — returns { ok, error }.
 */
export async function pushCorrectionToGraph(
  args: PushCorrectionArgs,
): Promise<{ ok: boolean; error?: string }> {
  const client = createGraphClient();
  if (!client.enabled) {
    return { ok: false, error: "graph_disabled" };
  }

  try {
    const correctionNodeId = stableGraphId("correction", args.correctionId);
    const jobNodeId = stableGraphId("job", args.jobId);
    const companyNodeId = stableGraphId("company", args.companyId);

    const corrUpsert = upsertNodesByLabel("Evidence" as "Evidence", [
      {
        id: correctionNodeId,
        ext_id: args.correctionId,
        quote: args.evidence.slice(0, 2000),
        // Evidence label reused as carrier if Correction unsupported —
        // Prefer dedicated Correction label via raw UNWIND.
      },
    ]);
    void corrUpsert;

    await withTimeout(
      client.run(
        `UNWIND $rows AS row MERGE (n {id: row.id}) SET n:Correction, n.ext_id = row.ext_id, n.old_label = row.old_label, n.new_label = row.new_label, n.evidence = row.evidence, n.source = row.source`,
        {
          rows: [
            {
              id: correctionNodeId,
              ext_id: args.correctionId,
              old_label: args.oldLabel ?? "",
              new_label: args.newLabel,
              evidence: args.evidence.slice(0, 2000),
              source: args.source,
            },
          ],
        },
      ),
      HYDRA_TIMEOUT_MS,
      "hydra:correction",
    );

    // Ensure Job + Company stubs exist (idempotent)
    await withTimeout(
      client.run(
        `UNWIND $rows AS row MERGE (n {id: row.id}) SET n:Job, n.ext_id = row.ext_id`,
        { rows: [{ id: jobNodeId, ext_id: args.jobId }] },
      ),
      HYDRA_TIMEOUT_MS,
      "hydra:job",
    );
    await withTimeout(
      client.run(
        `UNWIND $rows AS row MERGE (n {id: row.id}) SET n:Company, n.ext_id = row.ext_id, n.name = row.name`,
        {
          rows: [
            {
              id: companyNodeId,
              ext_id: args.companyId,
              name: args.companyName.slice(0, 200),
            },
          ],
        },
      ),
      HYDRA_TIMEOUT_MS,
      "hydra:company",
    );

    await withTimeout(
      client.run(
        `MATCH (j:Job {id: $jid}), (c:Correction {id: $cid}) CREATE (j)-[:CORRECTED_BY]->(c)`,
        { jid: jobNodeId, cid: correctionNodeId },
      ),
      HYDRA_TIMEOUT_MS,
      "hydra:edge-job",
    );
    await withTimeout(
      client.run(
        `MATCH (co:Company {id: $coid}), (c:Correction {id: $cid}) CREATE (c)-[:ABOUT_COMPANY]->(co)`,
        { coid: companyNodeId, cid: correctionNodeId },
      ),
      HYDRA_TIMEOUT_MS,
      "hydra:edge-company",
    );

    if (args.patternPhrase) {
      const patternId = stableGraphId("pattern", args.patternPhrase);
      await withTimeout(
        client.run(
          `UNWIND $rows AS row MERGE (n {id: row.id}) SET n:Pattern, n.phrase = row.phrase, n.label = row.label, n.weight = row.weight`,
          {
            rows: [
              {
                id: patternId,
                phrase: args.patternPhrase.slice(0, 200),
                label: args.patternLabel ?? args.newLabel,
                weight: args.patternWeight ?? 1,
              },
            ],
          },
        ),
        HYDRA_TIMEOUT_MS,
        "hydra:pattern",
      );
      await withTimeout(
        client.run(
          `MATCH (c:Correction {id: $cid}), (p:Pattern {id: $pid}) CREATE (c)-[:USES_PATTERN]->(p)`,
          { cid: correctionNodeId, pid: patternId },
        ),
        HYDRA_TIMEOUT_MS,
        "hydra:edge-pattern",
      );
    }

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Top-k similar past corrections via Pattern phrase overlap, falling back empty.
 * Graph query: Correction -USES_PATTERN-> Pattern <-USES_PATTERN- Correction
 */
export async function fetchSimilarCorrectionsFromGraph(
  phraseHints: string[],
  k = 3,
): Promise<
  Array<{ evidence: string; new_label: string; phrase: string }>
> {
  const client = createGraphClient();
  if (!client.enabled || phraseHints.length === 0) return [];

  const results: Array<{
    evidence: string;
    new_label: string;
    phrase: string;
  }> = [];

  try {
    for (const phrase of phraseHints.slice(0, 3)) {
      const pid = stableGraphId("pattern", phrase);
      const r = await withTimeout(
        client.run(
          `MATCH (p:Pattern {id: $pid})<-[:USES_PATTERN]-(c:Correction) RETURN c.evidence AS evidence, c.new_label AS new_label, p.phrase AS phrase`,
          { pid },
        ),
        HYDRA_TIMEOUT_MS,
        "hydra:similar",
      );
      for (const rec of r.records) {
        results.push({
          evidence: String(rec.evidence ?? ""),
          new_label: String(rec.new_label ?? ""),
          phrase: String(rec.phrase ?? phrase),
        });
        if (results.length >= k) return results;
      }
    }
  } catch {
    return results;
  }
  return results;
}

/**
 * Company → Job → Label prior from graph (majority label among active jobs).
 * Falls back empty on timeout/error.
 */
export async function companyLabelPriorFromGraph(
  companyId: string,
): Promise<{ label: string; n: number } | null> {
  const client = createGraphClient();
  if (!client.enabled) return null;
  const companyNodeId = stableGraphId("company", companyId);
  try {
    const r = await withTimeout(
      client.run(
        `MATCH (c:Company {id: $cid})-[:POSTS]->(j:Job) WHERE j.active = true RETURN j.label AS label, count(*) AS n`,
        { cid: companyNodeId },
      ),
      HYDRA_TIMEOUT_MS,
      "hydra:company-prior",
    );
    // Hydra may not support WHERE after MATCH well — if empty, try without filter
    let rows = r.records;
    if (rows.length === 0) {
      const r2 = await withTimeout(
        client.run(
          `MATCH (c:Company {id: $cid})-[:POSTS]->(j:Job) RETURN j.label AS label, count(*) AS n`,
          { cid: companyNodeId },
        ),
        HYDRA_TIMEOUT_MS,
        "hydra:company-prior2",
      );
      rows = r2.records;
    }
    const ranked = rows
      .map((rec) => ({
        label: String(rec.label ?? ""),
        n: Number(rec.n ?? 0),
      }))
      .filter((x) => x.label && x.label !== "unclear")
      .sort((a, b) => b.n - a.n);
    if (ranked[0] && ranked[0].n >= 2) return ranked[0];
    return null;
  } catch {
    return null;
  }
}
